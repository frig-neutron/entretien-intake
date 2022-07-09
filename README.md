# Intake and management of maintenance issues

The actual intake happens via a Google Form which kicks off a Google Apps Script. 

- The intake form scripts read the response values, package them up into a payload and fire it 
  at an HTTP enpoint running a google cloud function. All that code is in 
  [intake_form][intake_form]
- The cloud function then reads the form values, constructs a jira ticket and some email 
  notifications. The jira ticket goes to Jira and the notifications get mailed out. That 
  function lives in [intake_router][intake_router]

[intake_form]: ./intake_form
[intake_router]: ./intake_router
