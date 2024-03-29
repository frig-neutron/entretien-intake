import {toJira, toJiraTestMode} from "../appscript/Code"
import {mockJira} from "./mock/jira";
import {mockMailApp} from "./mock/mail";
import {mockSheetsApp} from "./mock/sheets";

describe("intake end-to-end", () => {

  describe("urgent", () => {
    const responseValues = responses([
      "28/03/2021 16:01:17",
      "L'eau chaude ne marche pas",
      "3737",
      "Sous-sol",
      "Urgent (à régler dans les prochaines 24 heures / to be repaired in the next 24 hours)",
      "Diego Briceño",
      "chauffe-eau"
    ])

    test("End to end, urgent", () => {
      const sheets = mockSheetsApp(responseValues)
      const jira = mockJira(responseValues);
      const mailApp = mockMailApp(responseValues)


      const timestampLike = /....-..-..T..:..:..\....Z/;

      toJira(null);

      sheets.logSheet.assertJiraUrlSetTo(jira.issueRestUrl)
      sheets.logSheet.assertJiraIssueKeySetTo(jira.issueKey)
      sheets.logSheet.assertProcessTimestampMatches(timestampLike)

      jira.assertTicketCreated({isUrgent: true})
      mailApp.assertAllMailSent(
          {
            to: 'yassaoubangoura@yahoo.fr',
            subject: 'URGENT maintenance report from Diego Briceño',
            bodyParts: {
              recipientName: "Moussa",
              reasonForReceiving: "you are a building representative for 3737",
              isUrgent: true,
              ...jira
            }
          },
          {
            to: 'mgutkowska2+intake@gmail.com',
            subject: 'URGENT maintenance report from Diego Briceño',
            bodyParts: {
              recipientName: "Monica",
              reasonForReceiving: "you are an Urgence-level responder",
              isUrgent: true,
              ...jira
            }
          },
          {
            to: 'shkosi@hotmail.com',
            subject: 'URGENT maintenance report from Diego Briceño',
            bodyParts: {
              recipientName: "Kosai",
              reasonForReceiving: "you are a triage responder",
              isUrgent: true,
              ...jira
            }
          }
      )
    })
    test("Test-mode", () => {
      mockSheetsApp(responseValues)
      const jira = mockJira(responseValues);
      const mailApp = mockMailApp(responseValues)

      toJiraTestMode("");

      jira.assertTicketCreated({
        isUrgent: true,
        summary: "TEST - " + jira.summaryLine
      })

      mailApp.assertAllMailSent(
          {
            to: 'frig.neutron+yassaoubangoura@gmail.com',
            subject: 'TEST - URGENT maintenance report from Diego Briceño',
            bodyParts: {
              recipientName: "Moussa",
              reasonForReceiving: "you are a building representative for 3737",
              isUrgent: true,
              ...jira
            }
          }, {
            to: 'frig.neutron+mgutkowska2+intake@gmail.com',
            subject: 'TEST - URGENT maintenance report from Diego Briceño',
            bodyParts: {
              recipientName: "Monica",
              reasonForReceiving: "you are an Urgence-level responder",
              isUrgent: true,
              ...jira
            }
          }, {
            to: 'frig.neutron+shkosi@gmail.com',
            subject: 'TEST - URGENT maintenance report from Diego Briceño',
            bodyParts: {
              recipientName: "Kosai",
              reasonForReceiving: "you are a triage responder",
              isUrgent: true,
              ...jira
            }
          })
    })
  })

  describe("non-urgent", () => {
    const responseValues = responses([
      "28/03/2021 16:01:17",
      "L'eau chaude ne marche pas",
      "3737",
      "Sous-sol",
      "Régulier (ça peut être régler dans plus de 24 heures / can be solved in more that 24 hours)",
      "Diego Briceño",
      "chauffe-eau"
    ])

    test("End to end, non-urgent", () => {
      mockSheetsApp(responseValues)
      const jira = mockJira(responseValues);
      const mailApp = mockMailApp(responseValues)

      toJira(null);

      jira.assertTicketCreated({isUrgent: false})

      mailApp.assertAllMailSent({
            to: 'yassaoubangoura@yahoo.fr',
            subject: 'Maintenance report from Diego Briceño',
            bodyParts: {
              recipientName: "Moussa",
              reasonForReceiving: "you are a building representative for 3737",
              isUrgent: false,
              ...jira
            }
          },
          {
            to: 'shkosi@hotmail.com',
            subject: 'Maintenance report from Diego Briceño',
            bodyParts: {
              recipientName: "Kosai",
              reasonForReceiving: "you are a triage responder",
              isUrgent: false,
              ...jira
            }
          }
      )
    })
  })
})

function mockery(resp: Responses) {
  return [mockSheetsApp(resp), mockJira(resp), mockMailApp(resp)]
}

export type Responses = ReturnType<typeof responses>

function responses(rowValues: string[]) {
  const responseColumns = ["Timestamp", "Description", "Bâtiment", "Zone", "Priorité", "Rapporté par", "Elément"]

  return {
    responseValue(column: string) {
      return Object.fromEntries(
          responseColumns.map((e, i) => [e, rowValues[i]])
      )[column]
    },
    nColumns: rowValues.length,
    headerRow: responseColumns,
    rowValues: rowValues
  }
}
