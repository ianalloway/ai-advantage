import apiHandler from "../../api/edge-alerts";
import { runApiHandler } from "../lib/api-adapter";

export const handler = (event: Parameters<typeof runApiHandler>[0]) => runApiHandler(event, apiHandler);
