import Redis from "ioredis";
import {
	createGameRoom,
	createLobby,
	destroyRoom,
	playerJoin,
	saveAndBrodcastResult,
} from "./game";
import { getPublicRooms } from "./lib";

export const redis = new Redis(process.env.REDIS_ENDPOINT as string);
// const room = await redis.call("JSON.GET", `rooms:${"PTSa2"}`);

const server = Bun.serve<{ email: string }>({
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
		open(ws) {
			const msg = `${ws.remoteAddress} has entered the chat`;
			console.log(msg);
			// ws.subscribe("the-group-chat");
			// server.publish("the-group-chat", msg);
		},
		message(ws, message) {
			const data = JSON.parse(message as string);
			// console.log(data);

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
		// async close(ws) {
		// 	const msg = `${ws.data.email} has left the chat`;
		// 	console.log(msg);
		// 	const roomId = await redis.get(`joined:${ws.data.email}`);

		// 	server.publish("the-group-chat", msg);
		// 	if (roomId) ws.unsubscribe(roomId);
		// },
	},
});
