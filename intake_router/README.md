# Intake router

This component receives notification of maintenance submission events, and

## Operational

### Parameters

Invocation parameters contain the email to send formatted as follows

💀 TODO

### Configuration

Configuration done using environment variables.

`ROUTES`: who to send mail to and why?

```yaml
"3735": # building identifer for locating building reps
  - justin@gmx.de
  - other.justin@also.here
triage: # always notified so they can manage jira tickets
  - triager_person@elsewhere.ca
urgence: # triggered whenever the "urgent" flag is set on the form
  - urgent_responder@alliance.ca
```
There's this concept of "priority" which doesn't affect anythign about the routing, but _does_ 
affect email rendering. If a person is both a "Building rep" and an "Urgent" responder then how do 
you address them in the notification and which email do you choose to send? To resolve the 
question, I'm treating priority as descending from top to bottom - that is roles listed lower 
down override roles listed above.

`DIRECTORY`: contact details

```yaml
- { email: justin@gmx.de, name: Justin, lang: en }
- { email: urgent_responder@alliance.ca, name: A. Responder, lang: fr }
```

The directory is used to look up the username of the recipient of a ticket notification. 
In frig-neutron/entretien-intake/issues/20 this will be useful to locate the email of the ticket 
submitter.

### Local testing

Running locally can be done w/ the `functions-framework`. Use the script command. The
`--signature-type=event` makes it only listen to HTTP POST, so `curl -XPOST localhost:8080`.
Removing the signature type makes it accept HTTP GET, but then it just hangs there. I think this is
because it expects a response on the 2nd function param.
