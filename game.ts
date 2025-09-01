import { redis, type ServerWebSocket } from "bun";
import {
    generateId,
    type GameState,
    type Player,
    type Choice,
    calculateWinner,
    encode,
} from "./lib";

type Socket = ServerWebSocket<{
    email: string;
}>;

export async function createLobby(
    ws: Socket,
    data: Player,
    publicRoom: boolean,
) {
    const roomId = generateId(5);
    ws.subscribe(`lobby:${roomId}`);
    await redis.send("JSON.SET", [
        `rooms:${roomId}`,
        "$",
        JSON.stringify({
            id: roomId,
            players: [data],
            state: "waiting",
            public: publicRoom,
        }),
    ]);
    await redis.expire(`rooms:${roomId}`, 60 * 30);

    const json = await redis.send("JSON.GET", [`joined:${ws.data.email}`]);
    const rooms = json ? JSON.parse(json as string) : [];
    redis.send("JSON.SET", [
        `joined:${ws.data.email}`,
        "$",
        JSON.stringify([...rooms, roomId]),
    ]);

    ws.send(
        encode("get_room_data", {
            data: {
                id: roomId,
                players: [data],
                state: "waiting",
                public: publicRoom,
            },
        }),
    );
}

export async function playerJoin(ws: Socket, roomCode: string, data: Player) {
    const json = (await redis.send("JSON.GET", [
        `rooms:${roomCode}`,
    ])) as string;
    let room = JSON.parse(json) as GameState;
    if (room) {
        if (room.players.length > 1) {
            ws.send(encode("room_is_full"));
            return;
        }
        if (room.state === "started") {
            ws.send(encode("room_is_started"));
            return;
        }
        room = {
            ...room,
            players: [...room.players, data],
            state: "started",
        };
        ws.send(encode("get_room_data", { data: room }));
        ws.subscribe(`lobby:${roomCode}`);
        await redis.send("JSON.SET", [
            `rooms:${roomCode}`,
            "$",
            JSON.stringify(room),
        ]);
        setTimeout(() => {
            ws.send(
                encode("prepare_round_one", {
                    game: room,
                }),
            );
        }, 1000);
        ws.publish(
            `lobby:${roomCode}`,
            encode("prepare_round_one", { game: room }),
        );
        const json = await redis.send("JSON.GET", [`joined:${ws.data.email}`]);
        const rooms = json ? JSON.parse(json as string) : [];
        redis.send("JSON.SET", [
            `joined:${ws.data.email}`,
            "$",
            JSON.stringify([...rooms, roomCode]),
        ]);
    } else {
        ws.send(encode("room_not_found"));
    }
}

export async function saveAndBrodcastResult(
    ws: Socket,
    choice: Choice,
    roomId: string,
) {
    const json = (await redis.send("JSON.GET", [`rooms:${roomId}`])) as string;
    const gState = JSON.parse(json) as GameState;
    const gameState = {
        ...gState,
        currentRound: {
            choices: gState.currentRound?.choices
                ? {
                      ...gState.currentRound.choices,
                      [ws.data.email]: choice,
                  }
                : {
                      [ws.data.email]: choice,
                  },
        },
    };

    await redis.send("JSON.SET", [
        `rooms:${roomId}`,
        "$",
        JSON.stringify(gameState),
    ]);

    if (Object.keys(gameState.currentRound.choices).length === 2) {
        const winner = calculateWinner(gameState.currentRound.choices);
        const roundResultState = {
            ...gameState,
            currentRound: {
                choices: gameState.currentRound.choices,
                winner,
            },
            records: gameState.records
                ? [...gameState.records, { winner }]
                : [{ winner }],
        };

        await redis.send("JSON.SET", [
            `rooms:${roomId}`,
            "$",
            JSON.stringify(roundResultState),
        ]);

        ws.send(encode("announce_winner", { game: roundResultState }));
        ws.publish(
            `game:${roomId}`,
            encode("announce_winner", { game: roundResultState }),
        );

        setTimeout(async () => {
            await redis.send("JSON.SET", [
                `rooms:${roomId}`,
                "$",
                JSON.stringify({
                    ...roundResultState,
                    currentRound: undefined,
                }),
            ]);
            ws.send(encode("select_choice"));
            ws.publish(`game:${roomId}`, encode("select_choice"));
        }, 3000);
    }
}

export function createGameRoom(ws: Socket, roomId: string) {
    ws.unsubscribe(`lobby:${roomId}`);
    ws.subscribe(`game:${roomId}`);
    setTimeout(() => {
        ws.publish(`game:${roomId}`, encode("select_choice"));
    }, 500);
}

export async function destroyRoom(ws: Socket, roomId: string) {
    ws.publish(`game:${roomId}`, encode("opp_left_game"));
    ws.unsubscribe(`game:${roomId}`);
    await redis.del(`rooms:${roomId}`);
    // await redis.send("JSON.DEL", `rooms:${roomId}`);
}
