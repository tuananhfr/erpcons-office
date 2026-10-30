import { Icon } from '@/components/Icon.tsx'
import type { SignupIcons } from './SignupPanel.tsx'

// Icon reads the SVG files at build time, so the server pages hand the glyphs to the client components.
export const signupIcons: SignupIcons = {
  sent: <Icon name="envelope-check" />,
  closed: <Icon name="person-lock" />,
  verifying: <Icon name="hourglass-split" />,
  verified: <Icon name="check2-circle" />,
  invalid: <Icon name="envelope-x" />,
  error: <Icon name="wifi-off" />,
  show: <Icon name="eye" />,
  hide: <Icon name="eye-slash" />,
  alert: <Icon name="exclamation-circle" />,
  retry: <Icon name="arrow-clockwise" />,
}
