intake = require("../appscript/Code")

let responseColumns = ["Timestamp", "Description", "Bâtiment", "Zone", "Priorité", "Rapporté par", "Elément"]
let formResponseSheetGetRange = jest.fn(() => ({
  getValues: () => ([responseColumns])
}))

global.SpreadsheetApp = {
  getActive: () => ({
    getSheetByName: (name) => {
      switch(name){
        case "Form responses 1":
          return {
            getLastColumn: () => responseColumns.length,
            getRange: formResponseSheetGetRange
          }
        case "state-of-affairs":
          return {

          }
      }
    }
  })
}

global.MailApp = {

}

// wrap value in fake iterator. Returns the same value over and over and over and over....
iter = (value) => ({
  next: () => value
})

global.DriveApp = {
  getRootFolder: () => ({
    getFoldersByName: (folderName) => {
      if (folderName === "jira") {
        return iter({
          getFilesByName: (fileName) => {
            if (fileName === "jira-basic-auth-token"){
              return iter({
                getBlob: () => ({
                  getDataAsString: () => " jira-token "
                })
              })
            }
          }
        })
      }
    }
  })
}

global.UrlFetchApp = {

}

test("End to end", () => {
  intake.toJira(null);
})

test("Create notification emails", () => {
  intake.roleDirectory["666"] = [{
    name: "TheBeast",
    email: "665+1@gmail.com"
  }]
  let ticketContext = {
    "jiraTicket": "abc123",
    "formData": {
      "building": 666,
      "summary": "summary",
      "priority": "Medium"
    },
    "rowIndex": 1
  }
  let emails = intake.createNotificationEmail(ticketContext)
  expect(emails).toMatchObject([{
    to: "665+1@gmail.com"
  }])
})
