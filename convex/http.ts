import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { googleCallback } from "./googleHttp";
import { graphCallback } from "./graphHttp";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({ path: "/graph/callback", method: "GET", handler: graphCallback });
http.route({ path: "/google/callback", method: "GET", handler: googleCallback });

export default http;
