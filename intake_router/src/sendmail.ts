import {createTransport, Transporter} from "nodemailer"
import {log} from "./logger";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import {Announcement} from "./announcement";

/**
 * Transport adaptor. Probably email but could be pubsub one day.
 */
export interface Sendmail {
  sendAnnouncement(announcement: Announcement): Promise<SMTPTransport.SentMessageInfo>
}

export interface SmtpConfig {
  smtp_username: string,
  smtp_password: string,
  smtp_host: string,
  smtp_from: string
}

const defaultTransporterFactory: (options: SMTPTransport.Options) => Transporter<SMTPTransport.SentMessageInfo> = createTransport

export function smtpSender(config: SmtpConfig, transporterFactory = defaultTransporterFactory): Sendmail {
  const transporter = transporterFactory({
    host: config.smtp_host,
    port: 465,
    secure: true,
    auth: {
      user: config.smtp_username,
      pass: config.smtp_password,
    },
  });


  const verificationResult = transporter.verify().
    then(_ => log.info("Verified SMTP connection")).
    catch(e => {
      log.error(`SMTP verification error ${e}`)
      throw e // necessary to short-circuit sendMail
    });

  return {
    sendAnnouncement(announcement: Announcement): Promise<SMTPTransport.SentMessageInfo> {
      return verificationResult.then(() => {
        return transporter.sendMail({
          from: config.smtp_from,
          to: announcement.primary_recipient,
          subject: announcement.subject,
          html: announcement.body
        })
      })
    }
  }
}
