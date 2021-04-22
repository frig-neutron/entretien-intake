let inTestMode = false
let testModePrefix = ""

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
function init() {
  responsesSheet = SpreadsheetApp.getActive().getSheetByName("Form responses 1");
  logSheet = SpreadsheetApp.getActive().getSheetByName("state-of-affairs");
  columnIndex = indexResponseFields(responsesSheet)
  jiraBasicAuthToken = gDriveModule.loadJiraBasicAuthToken()
}

class TicketContext {

  constructor(jiraTicket, formData) {
    this.jiraTicket = jiraTicket
    this.formData = formData
    this.rowIndex = formData.rowIndex
  }
}

class FormData {

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
    this.priority = this.mapFormToJiraPriority(rowFieldValue(responseFieldLabels.priority))
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
      map((f) => new TicketContext(jiraModule.formToJiraStruct(f), f))
  sendAll(tickets);
}

// ENTRY POINT FOR TEST MODE
function toJiraTestMode(e) {
  inTestMode = true
  for (const role in notifyModule.roleDirectory) {
    let receivers = notifyModule.roleDirectory[role]
    for (const receiverIndex in receivers) {
      let email = receivers[receiverIndex].email
      let atIndex = email.indexOf('@');
      receivers[receiverIndex].email = "daniil.alliance+" + email.substring(0, atIndex) + "@gmail.com"
    }
  }
  testModePrefix = "TEST - "
  toJira(e)
}

function indexResponseFields() {
  let headerValues = getHeaderValues()
  return indexFields(headerValues);
}

function getHeaderValues() {
  let nCols = responsesSheet.getLastColumn()
  let headerRange = responsesSheet.getRange(1, 1, 1, nCols)
  return headerRange.getValues()[0]
}

// return {fieldName: columnIndex} object
function indexFields(headerRow) {
  let entries = headerRow.map((e, i) => [e, i])
  return Object.fromEntries(entries)
}

/** @param {TicketContext[]} tickets */
function sendAll(tickets) {
  tickets.filter(stateModule.notAlreadyProcessed).map(sendAndMarkProcessed)
}

/** @param {TicketContext} ticketContext */
function sendAndMarkProcessed(ticketContext) {
  jiraModule.createJiraTicket(ticketContext)
  notifyModule.dispatch(ticketContext)
  stateModule.markProcessed(ticketContext)
}

function summarize(formData) {
  return formData.building + " " + formData.area + ": " + formData.summary
}

let stateModule = (function () {
  function mark(ticketRowIndex, columnIndex, value) {
    logSheet.getRange(ticketRowIndex, columnIndex).setValue(value)
  }

  return {
    notAlreadyProcessed(ticketContext) {
      let timestampValue = logSheet.getRange(ticketContext.rowIndex, 1).getValue();
      return timestampValue === "";
    },
    markProcessed(ticketContext) {
      let ticketRowIndex = ticketContext.rowIndex
      mark(ticketRowIndex, 1, new Date().toISOString())
      mark(ticketRowIndex, 2, ticketContext.jiraTicketKey)
      mark(ticketRowIndex, 3, ticketContext.jiraTicketRestLink)
    }
  }
})()

let jiraModule = (function () {

  function createDescription(formData) {
    return formData.description + "\n\n" +
        "Reported by " + formData.reporter;
  }

  function parseJiraResponse(httpResponse, ticketContext) {
    let contentJson = JSON.parse(httpResponse.getContentText())
    ticketContext.jiraTicketRestLink = contentJson.self
    ticketContext.jiraTicketUserLink = "https://lalliance.atlassian.net/browse/" + contentJson.key
    ticketContext.jiraTicketKey = contentJson.key
  }

  return {
    createJiraTicket(ticketContext) {
      let url = "https://lalliance.atlassian.net/rest/api/latest/issue"
      let headers = {
        "content-type": "application/json",
        "Accept": "application/json",
        "authorization": "Basic " + jiraBasicAuthToken
      };

      let payload = JSON.stringify(ticketContext.jiraTicket);
      let options = {
        "content-type": "application/json",
        "method": "POST",
        "headers": headers,
        "payload": payload
      };

      let httpResponse = UrlFetchApp.fetch(url, options);
      parseJiraResponse(httpResponse, ticketContext);
    },
    // must deserialize to com.atlassian.jira.rest.v2.issue.IssueUpdateBean
    // https://docs.atlassian.com/software/jira/docs/api/7.2.2/com/atlassian/jira/rest/v2/issue/IssueUpdateBean.html
    formToJiraStruct(formData) {
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
  }
})()

let notifyModule = (function () {
  let roleDirectory = {
    3735: [
      {"name": "Luis", "email": "luis.chepen+intake@gmail.com"},
      {"name": "Entretien committee mailbox", "email": "entretienlalliance+intake@gmail.com"},
      {"name": "Diego B", "email": "cuibafilms+intake@gmail.com"}
    ],
    3737: [
      {"name": "Moussa", "email": "yassaoubangoura@yahoo.fr"},
      {"name": "Yan", "email": "yan.michaud.ym+intake@gmail.com"},
      {"name": "Entretien committee mailbox", "email": "entretienlalliance+intake@gmail.com"},
      {"name": "Diego B", "email": "cuibafilms+intake@gmail.com"}
    ],
    3739: [
      {"name": "Geneviève", "email": "genevieve.alliance+intake@gmail.com"},
      {"name": "Entretien committee mailbox", "email": "entretienlalliance+intake@gmail.com"},
      {"name": "Diego B", "email": "cuibafilms+intake@gmail.com"}
    ],
    3743: [
      {"name": "Monika", "email": "mgutkowska2+intake@gmail.com"},
      {"name": "Entretien committee mailbox", "email": "entretienlalliance+intake@gmail.com"},
      {"name": "Diego B", "email": "cuibafilms+intake@gmail.com"}
    ],
    3745: [
      {"name": "Diego A", "email": "diegoabellap+intake@gmail.com"},
      {"name": "Entretien committee mailbox", "email": "entretienlalliance+intake@gmail.com"},
      {"name": "Diego B", "email": "cuibafilms+intake@gmail.com"}
    ],
    urgence: [
      {"name": "Monica", "email": "mgutkowska2+intake@gmail.com"},
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

  function renderSubjectForEmail(ticketContext) {
    return testModePrefix + (
        isUrgent(ticketContext) ?
            "URGENT maintenance report from " + ticketContext.formData.reporter :
            "Maintenance report from " + ticketContext.formData.reporter
    )
  }

  function renderTicketForEmail(ticketContext) {
    return summarize(ticketContext.formData) + "\n" + ticketContext.formData.description
  }

  function renderBuildingRepEmail(br, building, ticketContext) {
    let emailBody =
        `Dear ${br.name}

  Please be informed that ${ticketContext.formData.reporter} has submitted ${
            isUrgent(ticketContext) ? "an URGENT" : "a"} maintenance report:
  ------------------
  ${renderTicketForEmail(ticketContext)}
  -----------------
  Jira ticket ${ticketContext.jiraTicketUserLink} has been assigned to this report.
  You are receiving this email because you are a building representative for ${building}. 
  
  This automatic notification was sent by the entretien intake form.
  `
    return {
      to: br.email,
      subject: renderSubjectForEmail(ticketContext),
      body: emailBody
    }
  }

  function renderUrgenceEmails(ticketContext) {
    function renderUrgenceEmail(recipient) {
      let emailBody = `Dear ${recipient.name}

  Please be informed that ${ticketContext.formData.reporter} has submitted an URGENT maintenance report:
  ------------------
  ${renderTicketForEmail(ticketContext)}
  -----------------
  Jira ticket ${ticketContext.jiraTicketUserLink} has been assigned to this report.
  You are receiving this email because you are an Urgence-level responder. 
  
  This automatic notification was sent by the entretien intake form.
  `

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

  return {
    get roleDirectory() {
      return roleDirectory
    },
    dispatch(ticketContext) {
      let emails = createNotificationEmail(ticketContext);
      emails.map(email => MailApp.sendEmail(email))
    }
  }
})()

let gDriveModule = (function () {
  return {
    loadJiraBasicAuthToken() {
      let rootFolder = DriveApp.getRootFolder()
      let jiraFolder = rootFolder.getFoldersByName("jira").next()
      let tokenFile = jiraFolder.getFilesByName("jira-basic-auth-token").next()
      let blob = tokenFile.getBlob();
      return blob.getDataAsString().trim();
    }
  }
})()

// for testing
if (typeof module !== 'undefined') {
  module.exports.toJira = toJira
  module.exports.toJiraTestMode = toJiraTestMode
  module.exports.roleDirectory = notifyModule.roleDirectory
  module.exports.responseFieldLabels = responseFieldLabels
}
