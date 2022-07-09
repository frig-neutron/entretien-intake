/**
 * ANNOUNCEMENT, mailer copy
 *
 * <pre>
 * ATTN!!!
 * Pending the resolution of https://github.com/frig-neutron/entretien-announce/issues/10 any changes made to this file
 * must be manually replicated in https://github.com/frig-neutron/entretien-announce repository
 * announcer/src/announcement.ts and sendmail/src/announcement.ts
 * </pre>
 */
export interface Announcement {
  primary_recipient: string
  secondary_recipients: string[]
  subject: string,
  body: string
}
