import { httpRouter } from "convex/server";

import { auth } from "./auth";

const http = httpRouter();

// Rotas do Convex Auth (JWKS e descoberta OpenID que validam os tokens).
auth.addHttpRoutes(http);

export default http;
