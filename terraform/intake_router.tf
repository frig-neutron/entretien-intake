resource "google_service_account" "announcer" {
  project    = local.project_id
  account_id = "announcer"
}
