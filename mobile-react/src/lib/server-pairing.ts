import type { ServerConnectionDetails } from './server-connection-link'
import type { CreateServerProfileInput, ServerConnectionTestResult, ServerProfileListItem, ServerProfileTestInput, UpdateServerProfileInput } from './server-profile-ui'

export interface PairingActions {
  profiles: readonly ServerProfileListItem[]
  onTestConnection(input: ServerProfileTestInput): Promise<ServerConnectionTestResult> | ServerConnectionTestResult
  onCreateProfile(input: CreateServerProfileInput): Promise<string | { id: string }> | string | { id: string }
  onUpdateProfile(id: string, patch: UpdateServerProfileInput): Promise<void> | void
  onSwitchProfile(id: string): Promise<boolean | void> | boolean | void
}

/** Only called after the user confirms the address. Reuse secure profile mutations. */
export async function connectPairedServer(details: ServerConnectionDetails, actions: PairingActions, current = () => true): Promise<string> {
  const health = await actions.onTestConnection({ serverUrl: details.serverUrl, accessToken: details.accessToken })
  if (!current()) throw new Error('Pairing canceled.')
  const identity = health.server_identity?.trim()
  if (!health.ok || !identity) throw new Error('The server did not return a valid identity.')
  if (details.serverIdentity && details.serverIdentity !== identity) throw new Error('The server identity does not match this QR. Generate a new QR on the server.')
  const sameURL = actions.profiles.find(profile => profile.serverUrl.replace(/\/$/, '') === details.serverUrl)
  if (sameURL?.serverIdentity && sameURL.serverIdentity !== identity) throw new Error('This address belongs to a different saved server. Review it in server settings.')
  const existing = actions.profiles.find(profile => profile.serverIdentity === identity) ?? sameURL
  let id: string
  if (existing) {
    await actions.onUpdateProfile(existing.id, { serverUrl: details.serverUrl, accessToken: details.accessToken, serverIdentity: identity })
    id = existing.id
  } else {
    const created = await actions.onCreateProfile({ name: details.name || undefined, serverUrl: details.serverUrl,
      accessToken: details.accessToken, serverIdentity: identity, serverSetupComplete: true })
    id = typeof created === 'string' ? created : created.id
  }
  if (!current()) return id
  if (await actions.onSwitchProfile(id) === false) throw new Error('Server saved. Select it from Servers to reconnect.')
  return id
}
