import { redis } from "bun";
import {
    createGameRoom,
    createLobby,
    destroyRoom,
    playerJoin,
    saveAndBrodcastResult,
} from "./game";
import { getPublicRooms } from "./lib";

const server = Bun.serve<{ email: string }, any>({
    port: process.env.PORT || 3000,
    fetch(req, server) {
        const success = server.upgrade(req, {
            data: {
                email: "",
            },
        });
        if (success) return undefined;

        return new Response("Hello world", {
            headers: {
                "Access-Control-Allow-Origin": "*",
            },
        });
    },
    websocket: {
        message(ws, message) {
            const data = JSON.parse(message as string);

            switch (data.type) {
                case "store_email":
                    ws.data.email = data.email;
                    break;

                case "create_room":
                    createLobby(ws, data.player, data.public);
                    break;

                case "join_room":
                    playerJoin(ws, data.roomId, data.player);
                    break;

                case "make_choice":
                    saveAndBrodcastResult(ws, data.choice, data.game.id);
                    break;

                case "lobby_to_game":
                    createGameRoom(ws, data.game.id);
                    break;

                case "announce_left":
                    destroyRoom(ws, data.game.id);
                    break;

                case "fetch_public_rooms":
                    getPublicRooms(ws);
                    break;

                default:
                    break;
            }
        },
        async close(ws) {
            const json = await redis.send("JSON.GET", [
                `joined:${ws.data.email}`,
            ]);
            const rooms: string[] = json ? JSON.parse(json as string) : [];

            const lastRoom = rooms.pop();
            if (!lastRoom) return;
            destroyRoom(ws, lastRoom);
            redis.del(`joined:${ws.data.email}`);
        },
    },
});

console.log(`Listening on ${server.hostname}:${server.port}`);
