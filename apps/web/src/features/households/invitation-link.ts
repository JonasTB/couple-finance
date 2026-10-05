/** The token lives only in the URL fragment, which browsers never send to servers. */
export function invitationLink(token: string): string {
  return `${window.location.origin}/convite#t=${token}`;
}
