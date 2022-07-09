import {mock} from "jest-mock-extended";
import {responseFieldLabels} from "../../appscript/Code";
import {Responses} from "../intake.test";
import MailApp = GoogleAppsScript.Mail.MailApp;
import CustomMatcherResult = jest.CustomMatcherResult;

declare var global: typeof globalThis; // can't use @types/node

interface EmailMatchers {
  someCallSendsEmail(e: EmailSpec): CustomMatcherResult,

  callSendsEmail(e: EmailSpec): CustomMatcherResult,

  toSendAllEmail(...emailSpecs: EmailSpec[]): CustomMatcherResult

  emailBodyContainsParts(bodyParts: BodyParts): CustomMatcherResult
}

declare global {
  namespace jest {
    // noinspection JSUnusedGlobalSymbols - need this to give expect matcher hints
    interface Matchers<R> extends EmailMatchers {
    }

    // noinspection JSUnusedGlobalSymbols - need this to give expect matcher hints
    interface Expect extends EmailMatchers {
    }
  }
}

type MailAppSendMail = Parameters<typeof MailApp.sendEmail>;

export type EmailSpec = {
  to: string,
  subject: string,
  bodyParts: BodyParts
}

export type BodyParts = {
  recipientName: string,
  reasonForReceiving: string,
  isUrgent: boolean,
  issueKey: string,
  summaryLine: string
}

export function mockMailApp(resp: Responses) {
  const mailApp = installMockMailApp();
  installJestMatchers(resp)
  return {
    assertAllMailSent(...emailSpecs: EmailSpec[]) {
      expect(mailApp.sendEmail.mock.calls).toSendAllEmail(...emailSpecs);
    }
  }
}

function installMockMailApp() {
  const mailApp = mock<MailApp>()
  global.MailApp = mailApp
  return mailApp;
}

function installJestMatchers(resp: Responses) {
  expect.extend({
    emailBodyContainsParts(received: string, bodyParts: BodyParts): CustomMatcherResult {
      const submittedBy = resp.responseValue(responseFieldLabels.reportedBy)
      const description = resp.responseValue(responseFieldLabels.description)

      if (bodyParts.isUrgent) {
        expect(received).toMatch(new RegExp(submittedBy + " has submitted an URGENT maintenance report"))
      } else {
        expect(received).toMatch(new RegExp(submittedBy + " has submitted a maintenance report"))
      }
      expect(received).toMatch(new RegExp("^Dear " + bodyParts.recipientName))
      expect(received).toMatch(new RegExp(bodyParts.summaryLine + "\n" + description))
      expect(received).toMatch(new RegExp("You are receiving this email because " + bodyParts.reasonForReceiving))
      expect(received).toMatch(new RegExp(
          "Jira ticket "
          + "https://lalliance.atlassian.net/browse/" + bodyParts.issueKey
          + " has been assigned to this report"
      ))

      return {
        pass: true,
        message: () => "I ain't nothing to say to you"
      }
    },
    /**
     * Passes is this call sends this email
     * @param received - Jest call object
     * @param emailSpec
     */
    callSendsEmail(received: MailAppSendMail, emailSpec: EmailSpec): CustomMatcherResult {
      const emailObject = received[0]
      expect(emailObject).toMatchObject({
        to: emailSpec.to,
        subject: emailSpec.subject,
        body: expect.emailBodyContainsParts(emailSpec.bodyParts)
      })
      return {
        pass: true,
        message: () => "I ain't nothing to say to you"
      }
    },
    /**
     * Passes if at least one call matches emailSpec. (i.e.: if this email is sent by some call)
     * @param received - array of jest mock calls
     * @param emailSpec - spec of a single email
     */
    someCallSendsEmail(received: MailAppSendMail[], emailSpec: EmailSpec): CustomMatcherResult {
      type ErrOrMatchResult = CustomMatcherResult | Error
      const requireError = (e: unknown): Error => {
        if (e instanceof Error)
          return e
        else
          throw Error(`${e} should be of type Error, but it was something else`)
      }

      const assertionErrorOrUndefined: ErrOrMatchResult[] = received.map(theCall => {
        try {
          return expect(theCall).callSendsEmail(emailSpec)
        } catch (assertionError: unknown) {
          return requireError(assertionError)
        }
      })

      const isSuccess = (e: any): boolean => typeof e == "undefined" // no error == success
      const atLeastOneMatch = assertionErrorOrUndefined.map(isSuccess).filter((i: boolean) => i).length > 0
      const getMessage = (e: ErrOrMatchResult) => {
        if (e instanceof Error) {
          return e.message
        } else {
          return e.message()
        }
      }

      const isFailure = (e: any): boolean => !isSuccess(e)
      const failures = assertionErrorOrUndefined.filter(isFailure);
      return {
        pass: atLeastOneMatch,
        message: () => {
          const matchFailures: string[] = failures.map(getMessage)
          return `No email matches spec ${JSON.stringify(emailSpec, null, 2)}\n` + matchFailures.join("\n")
        }
      }
    },
    /**
     * Passes if each email objects is matched by the callSendsEmail matcher. (i.e.: if every email is sent)
     * @param received - array of Jest mock calls
     * @param emailSpecs - array of email message specifications
     */
    toSendAllEmail(received: MailAppSendMail[], ...emailSpecs): CustomMatcherResult {
      emailSpecs.map(e => expect(received).someCallSendsEmail(e));
      return {
        pass: true,
        message: () => "I ain't nothing to say to you"
      }
    }
  })
}
