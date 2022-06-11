import URLFetchRequestOptions = GoogleAppsScript.URL_Fetch.URLFetchRequestOptions;
import HttpHeaders = GoogleAppsScript.URL_Fetch.HttpHeaders;
import Sheet = GoogleAppsScript.Spreadsheet.Sheet;

let inTestMode = false
let testModePrefix = ""

let responsesSheet: Sheet
let logSheet: Sheet

let columnIndex: { [k: string]: number }
let jiraBasicAuthToken
const jiraPriorityUrgent = "Urgent"
const jiraPriorityMedium = "Medium"
const responseFieldLabels = {
  building: "Bâtiment",
  element: "Elément",
  description: "Description",
  area: "Zone",
  reportedBy: "Rapporté par",
  priority: "Priorité"
}

/**
 * Delayed init or unit tests won't run b/c of missing symbols
 */
function init() {
  responsesSheet = SpreadsheetApp.getActive().getSheetByName("Form responses 1");
  logSheet = SpreadsheetApp.getActive().getSheetByName("state-of-affairs");
  columnIndex = indexResponseFields()
  jiraBasicAuthToken = loadJiraBasicAuthToken()
}

class TicketContext {
  jiraTicket: unknown
  formData: unknown
  rowIndex: number

  constructor(jiraTicket, formData) {
    this.jiraTicket = jiraTicket
    this.formData = formData
    this.rowIndex = formData.rowIndex
  }
}

class FormData {
  rowIndex: string
  building: string
  summary: string
  description: string
  area: string
  reporter: string
  priority: string

  constructor(rowData, rowIndex) {
    function rowFieldValue(fieldName) {
      return rowData[columnIndex[fieldName]]
    }

    this.rowIndex = rowIndex
    this.building = rowFieldValue(responseFieldLabels.building)
    this.summary = rowFieldValue(responseFieldLabels.element)
    this.description = rowFieldValue(responseFieldLabels.description)
    this.area = rowFieldValue(responseFieldLabels.area)
    this.reporter = rowFieldValue(responseFieldLabels.reportedBy)
    this.priority = this.mapFormToJiraPriority(rowFieldValue(responseFieldLabels.priority)
    )
  }

  mapFormToJiraPriority(formPriorityValue) {
    if (formPriorityValue.startsWith("Urgent")) {
      return jiraPriorityUrgent
    } else {
      return jiraPriorityMedium
    }
  }
}

// ENTRY POINT
// noinspection JSUnusedLocalSymbols
function toJira(e) {
  init()
  let numRows = responsesSheet.getLastRow();
  let dataRange = responsesSheet.getRange(2, 1, numRows - 1, responsesSheet.getLastColumn())

  let rowOffset = 2 // 1 for header & 1 for starting count from 1
  let tickets = dataRange.getValues().
    map((r, i) => new FormData(r, i + rowOffset)).
    map((f) => new TicketContext(asTicket(f), f))
  sendAll(tickets);
}

// ENTRY POINT FOR TEST MODE
function toJiraTestMode(e) {
  inTestMode = true
  for (const role in roleDirectory){
    let receivers = roleDirectory[role]
    for (const receiverIndex in receivers) {
      let email = receivers[receiverIndex].email
      let atIndex = email.indexOf('@');
      receivers[receiverIndex].email = "frig.neutron+" + email.substring(0, atIndex) + "@gmail.com"
    }
  }
  testModePrefix = "TEST - "
  toJira(e)
}

function indexResponseFields(): { [k: string]: number } {
  const headerValues: string[] = getHeaderValues()
  return indexFields(headerValues);
}

function getHeaderValues(): string[] {
  let nCols = responsesSheet.getLastColumn()
  let headerRange = responsesSheet.getRange(1, 1, 1, nCols)
  return headerRange.getValues()[0]
}

// return {fieldName: columnIndex} object
function indexFields(headerRow: string[]): { [k: string]: number } {
  const entries = new Map(headerRow.map((e, i) => [e, i]))
  return Object.fromEntries(entries)
}

// must deserialize to com.atlassian.jira.rest.v2.issue.IssueUpdateBean
// https://docs.atlassian.com/software/jira/docs/api/7.2.2/com/atlassian/jira/rest/v2/issue/IssueUpdateBean.html
function asTicket(formData) {
  return {
    "fields": {
      "project": {
        "key": "TRIAG"
      },
      "summary": testModePrefix + summarize(formData),
      "description": createDescription(formData),
      // "customfield_10038": {"id": 10033}, // building
      // "Area": formData.area,
      "priority": {"name": formData.priority},
      "issuetype": {
        "name": "Intake"
      }
    }
  };
}

function summarize(formData) {
  return formData.building + " " + formData.area + ": " + formData.summary
}

function createDescription(formData) {
  return formData.description + "\n\n" +
      "Reported by " + formData.reporter;
}

// input is [TicketContext, ...]
function sendAll(tickets) {
  tickets.map(ticketContext => sendAndMark(ticketContext))
}

function sendAndMark(ticketContext) {
  if (notAlreadySent(ticketContext.rowIndex)) {
    ticketContext.sendResponse = sendOne(ticketContext)
    markSent(ticketContext)
    dispatch(ticketContext)
  }
}

function notAlreadySent(ticketRowIndex) {
  let timestampValue = logSheet.getRange(ticketRowIndex, 1).getValue();
  return timestampValue === "";
}

function sendOne(ticketContext) {
  const payload: string = JSON.stringify(ticketContext.jiraTicket);
  const url = "https://lalliance.atlassian.net/rest/api/latest/issue"
  const headers: HttpHeaders = {
    "content-type": "application/json",
    "Accept": "application/json",
    "authorization": "Basic " + jiraBasicAuthToken
  };

  const options: URLFetchRequestOptions = {
    "contentType": "application/json",
    "method": "post",
    "headers": headers,
    "payload": payload
  };

  return UrlFetchApp.fetch(url, options);
}

function markSent(ticketContext) {
  let contentJson = JSON.parse(ticketContext.sendResponse.getContentText())
  let issueKey = contentJson.key
  let link = contentJson.self
  ticketContext.jiraTicketRestLink = link
  ticketContext.jiraTicketUserLink = "https://lalliance.atlassian.net/browse/" + issueKey
  ticketContext.jiraTicketKey = issueKey
  let ticketRowIndex = ticketContext.rowIndex
  mark(ticketRowIndex, 1, new Date().toISOString())
  mark(ticketRowIndex, 2, issueKey)
  mark(ticketRowIndex, 3, link)

}

function mark(ticketRowIndex, columnIndex, value) {
  logSheet.getRange(ticketRowIndex, columnIndex).setValue(value)
}

////////////////////////// DISPATCH ///////////////////////////
////////////////////////// DISPATCH ///////////////////////////
////////////////////////// DISPATCH ///////////////////////////

let roleDirectory = {
  3735: [
    {"name": "Luis", "email": "luis.chepen+intake@gmail.com"},
  ],
  3737: [
    {"name": "Emmanuelle", "email": "emmanuelleraynauld+intake@gmail.com"},
    {"name": "Moussa", "email": "yassaoubangoura@yahoo.fr"},
  ],
  3739: [
    {"name": "Kris", "email": "kris.onishi@mcgill.ca"},
  ],
  3743: [
    {"name": "Monika", "email": "mgutkowska2+intake@gmail.com"},
  ],
  3745: [
    {"name": "Diego A", "email": "diegoabellap+intake@gmail.com"},
  ],
  urgence: [
    {"name": "Monica", "email": "mgutkowska2+intake@gmail.com"},
  ],
  triage: [
    {"name": "Kosai", "email": "shkosi@hotmail.com"},
    {"name": "Diego B", "email": "cuibafilms+intake@gmail.com"},
    {"name": "Entretien committee mailbox", "email": "entretienlalliance+intake@gmail.com"},
  ]
}

function createNotificationEmail(ticketContext) {
  let building = ticketContext.formData.building
  let buildingReps = roleDirectory[ticketContext.formData.building]
  let buildingRepEmails = buildingReps.map(br => renderBuildingRepEmail(br, building, ticketContext))
  let urgenceEmails = renderUrgenceEmails(ticketContext)
  let triageEmails = roleDirectory.triage.map(triager => renderTriageEmail(triager, ticketContext))
  return buildingRepEmails.concat(triageEmails).concat(urgenceEmails);
}

function dispatch(ticketContext) {
  let emails = createNotificationEmail(ticketContext);
  emails.map(email => MailApp.sendEmail(email))
}

const emailBodyTemplate = (recipient, ticketContext, sendReason) =>
    `Dear ${recipient.name}

  Please be informed that ${ticketContext.formData.reporter} has submitted ${
        isUrgent(ticketContext) ? "an URGENT" : "a"} maintenance report:
  ------------------
  ${renderTicketForEmail(ticketContext)}
  -----------------
  Jira ticket ${ticketContext.jiraTicketUserLink} has been assigned to this report.
  You are receiving this email because ${sendReason}. 
  
  `

function renderBuildingRepEmail(recipient, building, ticketContext) {
  let emailBody = emailBodyTemplate(recipient, ticketContext,
      `you are a building representative for ${building}`)

  return {
    to: recipient.email,
    subject: renderSubjectForEmail(ticketContext),
    body: emailBody
  }
}

function renderTriageEmail(recipient, ticketContext) {
  let emailBody = emailBodyTemplate(recipient, ticketContext, `you are a triage responder`)

  return {
    to: recipient.email,
    subject: renderSubjectForEmail(ticketContext),
    body: emailBody
  }
}

function renderUrgenceEmails(ticketContext) {
  function renderUrgenceEmail(recipient) {
    let emailBody = emailBodyTemplate(recipient, ticketContext, `you are an Urgence-level responder`)

    return {
      to: recipient.email,
      subject: renderSubjectForEmail(ticketContext),
      body: emailBody
    }
  }

  if (isUrgent(ticketContext)) {
    return roleDirectory.urgence.map(ur => renderUrgenceEmail(ur))
  } else {
    return []
  }
}

function isUrgent(ticketContext) {
  return ticketContext.formData.priority === jiraPriorityUrgent;
}

function renderSubjectForEmail(ticketContext) {
  return testModePrefix + (
      isUrgent(ticketContext) ?
        "URGENT maintenance report from " + ticketContext.formData.reporter:
        "Maintenance report from " + ticketContext.formData.reporter
  )
}

function renderTicketForEmail(ticketContext) {
  return summarize(ticketContext.formData) + "\n" + ticketContext.formData.description
}

function loadJiraBasicAuthToken() {
  let rootFolder = DriveApp.getRootFolder()
  let jiraFolder = rootFolder.getFoldersByName("jira").next()
  let tokenFile = jiraFolder.getFilesByName("jira-basic-auth-token").next()
  let blob = tokenFile.getBlob();
  return blob.getDataAsString().trim();
}

// for testing
if (typeof module !== 'undefined') {
  module.exports.toJira = toJira
  module.exports.toJiraTestMode = toJiraTestMode
  module.exports.roleDirectory = roleDirectory
  module.exports.responseFieldLabels = responseFieldLabels
}
