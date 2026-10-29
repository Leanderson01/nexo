import { httpRouter } from "convex/server";

import { auth } from "./auth";
import { registerTicketingRoutes } from "./ticketing/http";

const http = httpRouter();

// Rotas do Convex Auth (JWKS e descoberta OpenID que validam os tokens).
auth.addHttpRoutes(http);

// API do serviço de chamados simulado (§5.6), usada pelo `HttpTicketGateway` do agent.
registerTicketingRoutes(http);

export default http;
