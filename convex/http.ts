import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { graphCallback } from "./graphHttp";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({ path: "/graph/callback", method: "GET", handler: graphCallback });

export default http;
