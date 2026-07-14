import apiHandler from "../../api/newsletter-subscribe";
import { runApiHandler } from "../lib/api-adapter";

export const handler = (event: Parameters<typeof runApiHandler>[0]) => runApiHandler(event, apiHandler);
