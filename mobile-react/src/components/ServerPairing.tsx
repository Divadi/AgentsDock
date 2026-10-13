import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, StyleSheet } from 'react-native'
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { parseServerConnectionLink, localOnlyServerUrl, type ServerConnectionDetails } from '../lib/server-connection-link'
import { connectPairedServer, type PairingActions } from '../lib/server-pairing'
import { usePalette } from '../theme'
import { Text } from './AppText'

export function ServerPairing({ initialLink, onClose, onConnected, ...actions }: PairingActions & {
  initialLink?: string | null
  onClose(): void
  onConnected(): void
}) {
  const colors = usePalette()
  const [permission, requestPermission] = useCameraPermissions()
  const [candidate, setCandidate] = useState<ServerConnectionDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const [pickingImage, setPickingImage] = useState(false)
  const alive = useRef(true)
  const scanning = useRef(true)
  const committing = useRef(false)
  const choosingImage = useRef(false)
  const accept = (value: string) => {
    if (!scanning.current || committing.current) return
    scanning.current = false
    try { setCandidate(parseServerConnectionLink(value)); setError(null) }
    catch { setError('This is not a supported AgentsDock connection QR. Generate a new one with agentsdock pair.'); }
  }
  useEffect(() => {
    alive.current = true
    if (initialLink) accept(initialLink)
    const sub = AppState.addEventListener('change', value => setForeground(value === 'active'))
    return () => { alive.current = false; sub.remove() }
  }, [])
  const chooseImage = async () => {
    if (committing.current || choosingImage.current) return
    choosingImage.current = true
    setPickingImage(true)
    scanning.current = false
    try {
      const image = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], selectionLimit: 1 })
      if (image.canceled || !alive.current) { scanning.current = true; return }
      const results = await scanFromURLAsync(image.assets[0].uri, ['qr'])
      if (!alive.current) return
      const links = [...new Set(results.map(result => result.data))]
      if (links.length !== 1) { setError('Choose an image containing exactly one connection QR.'); return }
      scanning.current = true
      accept(links[0])
    } catch { if (alive.current) setError('Could not read that QR image. Try another image or scan with the camera.') }
    finally { choosingImage.current = false; if (alive.current) setPickingImage(false) }
  }
  const connect = async () => {
    if (!candidate || committing.current) return
    committing.current = true; setBusy(true); setError(null)
    try {
      await connectPairedServer(candidate, actions, () => alive.current)
      if (alive.current) { setCandidate(null); onConnected() }
    } catch {
      if (alive.current) setError('Could not connect safely. Check the Wi-Fi/Tailscale connection and server address, or generate a fresh QR. Existing servers have not been replaced with a different identity.')
    } finally { committing.current = false; if (alive.current) setBusy(false) }
  }
  const button = (label: string, action: () => void, disabled = busy || pickingImage) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={action}
    style={[styles.button, { borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}><Text style={{ color: colors.text }}>{label}</Text></Pressable>
  return <ScrollView contentContainerStyle={styles.body}>
    <Text style={[styles.heading, { color: colors.text }]}>Scan connection QR</Text>
    {candidate ? <>
      <Text style={{ color: colors.text }}>{candidate.name || 'Agent server'}</Text>
      <Text selectable style={{ color: colors.text }}>{candidate.serverUrl}</Text>
      {localOnlyServerUrl(candidate.serverUrl) && <Text style={{ color: colors.muted }}>This address is local to this device. For a physical phone, generate a QR with a LAN or Tailscale address.</Text>}
      <Text style={{ color: colors.muted }}>Connect to this server and save its access token securely on this device.</Text>
      {button(busy ? 'Connecting…' : 'Connect and save', () => { void connect() })}
    </> : <>
      <Text style={{ color: colors.muted }}>Run agentsdock pair on your server. Keep your phone on the same Wi-Fi or Tailscale network.</Text>
      {permission?.granted && foreground && !error && !pickingImage
        ? <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={result => accept(result.data)}
          onMountError={() => setError('Camera unavailable on this device. Choose a QR image instead.')} />
        : !permission?.granted ? button(permission?.canAskAgain === false ? 'Open camera settings' : 'Allow camera', () => {
          void (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission()).catch(() => setError('Camera access is unavailable. You can choose a QR image instead.'))
        }) : null}
      {button('Choose QR image', () => { void chooseImage() })}
    </>}
    {busy && <ActivityIndicator />}
    {error && <Text accessibilityRole="alert" style={{ color: colors.text }}>{error}</Text>}
    {(candidate || error) && button('Scan another QR', () => { setCandidate(null); setError(null); scanning.current = true })}
    {button('Back to servers', onClose)}
  </ScrollView>
}

const styles = StyleSheet.create({ body: { padding: 20, gap: 16 }, heading: { fontSize: 22, fontWeight: '600' },
  button: { padding: 14, borderWidth: 1, borderRadius: 10, alignItems: 'center' }, camera: { height: 280, borderRadius: 12 } })
