/** @type {GoogleAppsScript.Spreadsheet.Sheet} */
let responsesSheet

/** @type {GoogleAppsScript.Spreadsheet.Sheet} */
let logSheet
let columnIndex
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
function init(){
  responsesSheet = SpreadsheetApp.getActive().getSheetByName("Form responses 1");
  logSheet = SpreadsheetApp.getActive().getSheetByName("state-of-affairs");
  columnIndex = indexResponseFields(responsesSheet)
  jiraBasicAuthToken = loadJiraBasicAuthToken()
}

class TicketContext {

  constructor (jiraTicket, formData){
    this.jiraTicket = jiraTicket
    this.formData = formData
    this.rowIndex = formData.rowIndex
  }
}

class FormData {

  constructor (rowData, rowIndex){
    function rowFieldValue(fieldName){
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

function indexResponseFields(){
  let headerValues = getHeaderValues()
  return indexFields(headerValues);
}

function getHeaderValues(){
  let nCols = responsesSheet.getLastColumn()
  let headerRange = responsesSheet.getRange(1, 1, 1, nCols)
  return headerRange.getValues()[0]
}

// return {fieldName: columnIndex} object
function indexFields(headerRow){
  let entries = headerRow.map((e, i) => [e, i])
  return Object.fromEntries(entries)
}

// must deserialize to com.atlassian.jira.rest.v2.issue.IssueUpdateBean
// https://docs.atlassian.com/software/jira/docs/api/7.2.2/com/atlassian/jira/rest/v2/issue/IssueUpdateBean.html
function asTicket(formData){
  return {
    "fields": {
      "project":{
        "key": "TRIAG"
      },
      "summary": summarize(formData),
      "description": createDescription(formData),
      // "customfield_10038": {"id": 10033}, // building
      // "Area": formData.area,
      "priority": {"name": formData.priority},
      "issuetype":{
        "name": "Intake"
      }
    }
  };
}

function summarize(formData) {
  return formData.building + " " + formData.area + ": " + formData.summary
}

function createDescription(formData){
  return formData.description + "\n\n" + 
  "Reported by " + formData.reporter;
}

// input is [TicketContext, ...]
function sendAll(tickets){
  tickets.map(ticketContext => sendAndMark(ticketContext))
}

function sendAndMark(ticketContext){
  if (notAlreadySent(ticketContext.rowIndex)){
    ticketContext.sendResponse = sendOne(ticketContext)
    markSent(ticketContext)
    dispatch(ticketContext)
  } 
}

function notAlreadySent(ticketRowIndex){
  let timestampValue = logSheet.getRange(ticketRowIndex, 1).getValue();
  return timestampValue === "";
}

function sendOne(ticketContext){
  let payload = JSON.stringify(ticketContext.jiraTicket);
  let url = "https://lalliance.atlassian.net/rest/api/latest/issue"
  let headers = {
    "content-type": "application/json",
    "Accept": "application/json",
    "authorization": "Basic " + jiraBasicAuthToken
  };

  let options = {
    "content-type": "application/json",
    "method": "POST",
    "headers": headers,
    "payload": payload
  };

  return UrlFetchApp.fetch(url, options);
}

function markSent(ticketContext){
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

function mark(ticketRowIndex, columnIndex, value){
  logSheet.getRange(ticketRowIndex, columnIndex).setValue(value)
}


////////////////////////// DISPATCH ///////////////////////////
////////////////////////// DISPATCH ///////////////////////////
////////////////////////// DISPATCH ///////////////////////////


let roleDirectory = {
  3735: [
    { "name": "Luis", "email": "daniil.alliance+as.luis.br3735@gmail.com" }, 
    // { "name": "Luis", "email": "cuibafilms+as.luis.br3735@gmail.com" }
    ],
  3737: [
    { "name": "Moussa", "email": "daniil.alliance+as.moussa.br3737@gmail.com" },
    // { "name": "Moussa", "email": "cuibafilms+as.moussa.br3737@gmail.com" }
    ],
  3739: [
    { "name": "Geneviève", "email": "daniil.alliance+as.genevieve.br3739@gmail.com" },
    // { "name": "Geneviève", "email": "cuibafilms+as.genevieve.br3739@gmail.com" }
    ],
  3743: [
    { "name": "Monika", "email": "daniil.alliance+as.monika.br3743@gmail.com" }, 
    // { "name": "Monika", "email": "cuibafilms+as.monika.br3743@gmail.com" }
    ],
  3745: [
    { "name": "Diego", "email": "daniil.alliance+as.diego.br3745@gmail.com" },
    // { "name": "Diego", "email": "cuibafilms+as.diego.br3745@gmail.com" },
    ],
  urgence: [
    { "name": "Monica", "email": "daniil.alliance+urgence@gmail.com" }, 
    // { "name": "Monica", "email": "cuibafilms+urgence@gmail.com" }
    ],
  triage: []
}

function createNotificationEmail(ticketContext) {
  let building = ticketContext.formData.building
  let buildingReps = roleDirectory[ticketContext.formData.building]
  let buildingRepEmails = buildingReps.map(br => renderBuildingRepEmail(br, building, ticketContext))
  let urgenceEmails = renderUrgenceEmails(ticketContext)
  return buildingRepEmails.concat(urgenceEmails);
}

function dispatch(ticketContext) {
  let emails = createNotificationEmail(ticketContext);
  emails.map(email => MailApp.sendEmail(email))
}

function renderBuildingRepEmail(br, building, ticketContext) {
  let emailBody =
    `Dear ${br.name}

  Please be informed that ${ticketContext.formData.reporter} has submitted ${isUrgent(ticketContext) ? "an URGENT" : "a"} maintenance report:
  ------------------
  ${renderTicketForEmail(ticketContext)}
  -----------------
  Jira ticket ${ticketContext.jiraTicketUserLink} has been assigned to this report.
  You are receiving this email because you are a building representative for ${building}. 
  
  `

  return  {
    to: br.email,
    subject: renderSubjectForEmail(ticketContext),
    body: emailBody
  }
}

function renderUrgenceEmails(ticketContext){
  function renderUrgenceEmail(recipient) {
    let emailBody = `Dear ${recipient.name}

  Please be informed that ${ticketContext.formData.reporter} has submitted an URGENT maintenance report:
  ------------------
  ${renderTicketForEmail(ticketContext)}
  -----------------
  Jira ticket ${ticketContext.jiraTicketUserLink} has been assigned to this report.
  You are receiving this email because you are an Urgence-level responder. 
  
  `

    return  {
      to: recipient.email,
      subject: renderSubjectForEmail(ticketContext),
      body: emailBody
    }
  }

  if (isUrgent(ticketContext)){
    return roleDirectory.urgence.map(ur => renderUrgenceEmail(ur))
  } else {
    return []
  }
}

function isUrgent(ticketContext) {
  return ticketContext.formData.priority === jiraPriorityUrgent;
}

function renderSubjectForEmail(ticketContext){
  if (isUrgent(ticketContext)){
    return "URGENT maintenance report from " + ticketContext.formData.reporter
  } else {
    return "Maintenance report from " + ticketContext.formData.reporter
  }
}

function renderTicketForEmail(ticketContext){
  return summarize(ticketContext.formData) + "\n" + ticketContext.formData.description
}

function loadJiraBasicAuthToken(){
  let rootFolder = DriveApp.getRootFolder()
  let jiraFolder = rootFolder.getFoldersByName("jira").next()
  let tokenFile = jiraFolder.getFilesByName("jira-basic-auth-token").next()
  let blob = tokenFile.getBlob();
  return blob.getDataAsString().trim();
}

// for testing
if (typeof module !== 'undefined'){
  module.exports.toJira = toJira
  module.exports.roleDirectory = roleDirectory
  module.exports.responseFieldLabels = responseFieldLabels
}
