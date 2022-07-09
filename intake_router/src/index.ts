import {config as dotenv_config} from "dotenv"

import {log} from "./logger";
import {smtpSender} from "./sendmail";
import {Announcement} from "./announcement";
import {HttpFunction, Request} from "@google-cloud/functions-framework/build/src/functions";
import {Response} from "express";


process.on('uncaughtException', function (err) {
  console.error('Uncaught exception', err);
});

const envResult = dotenv_config()

// https://cloud.google.com/functions/docs/writing/background#function_parameters
// Absolutely MUST use the 3-param version b/c otherwise there seems to be no way to terminate the function properly.
// Returning a resolved Promise doesn't cut it - you still get "Finished with status: response error"
const sendmail: HttpFunction = async (req: Request, res: Response) => {
  // log.info(`Starting with data=${JSON.stringify(data)}`)
}


export {sendmail}
