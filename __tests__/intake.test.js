intake = require("../appscript/Code")
test("first test", () => {
  expect(1).toBeTruthy()
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
