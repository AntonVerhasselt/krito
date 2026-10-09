/**
 * Krito is for schools: analyses must be started with a school address, not a
 * personal mailbox. This list covers the consumer providers teachers in
 * Flanders are most likely to use; school domains are never listed.
 */
const personalDomains = new Set([
  // Google, Microsoft, Apple, Yahoo
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.be",
  "hotmail.com",
  "hotmail.be",
  "hotmail.nl",
  "hotmail.fr",
  "live.com",
  "live.be",
  "live.nl",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "yahoo.com",
  "yahoo.be",
  "yahoo.fr",
  "ymail.com",
  // Belgian internet providers
  "telenet.be",
  "skynet.be",
  "proximus.be",
  "scarlet.be",
  "pandora.be",
  "belgacom.net",
  "edpnet.be",
  "voo.be",
  // Other free mailboxes
  "aol.com",
  "gmx.com",
  "gmx.net",
  "gmx.de",
  "web.de",
  "mail.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "tutanota.com",
  "tuta.io",
  "zoho.com",
  "yandex.com",
  "orange.fr",
  "free.fr",
  "ziggo.nl",
  "kpnmail.nl",
]);

export function emailDomain(email: string) {
  return email.trim().toLowerCase().split("@").at(-1) ?? "";
}

export function isPersonalEmail(email: string) {
  return personalDomains.has(emailDomain(email));
}
