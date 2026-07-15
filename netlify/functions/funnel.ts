import apiHandler from "../../api/funnel";
import { runApiHandler } from "../lib/api-adapter";

export const handler = (event: Parameters<typeof runApiHandler>[0]) => runApiHandler(event, apiHandler);
