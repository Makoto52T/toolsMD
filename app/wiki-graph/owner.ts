// The /wiki-graph view and its backing /api/wiki/graph route are private to the
// project owner (toonteamm). Both the Server Component page and the route handler
// import this single constant so the gate can never drift between them.
export const WIKI_GRAPH_OWNER_ID = 'a37eead8-9a6d-49e9-abcd-7a0a0624f8b3';
