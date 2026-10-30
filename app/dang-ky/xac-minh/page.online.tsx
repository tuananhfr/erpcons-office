import type { Metadata } from 'next'
import { SiteFooter } from '@/components/landing/SiteFooter.tsx'
import { SiteHeader } from '@/components/landing/SiteHeader.tsx'
import { VerifySignup } from '@/components/signup/VerifySignup.tsx'
import { signupIcons } from '@/components/signup/signup-icons.tsx'
import { createPageSeo } from '@/lib/seo/page-seo.ts'
import { pageMetadata } from '@/lib/seo/metadata.ts'
import '@/styles/signup.css'

// Reached from the verification email; the token is in the fragment, so no request, log or Referer carries it.
const SEO = createPageSeo('/dang-ky/xac-minh/', 'Xác minh email', 'Xác minh email để hoàn tất đăng ký tài khoản PI ID trên Văn phòng by ERPCons.')
export const metadata: Metadata = { ...pageMetadata(SEO), robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default function VerifySignupPage() {
  return <><SiteHeader active="signup" /><main id="noi-dung" className="erp-container erp-signup erp-signup--verify">
    <div className="erp-signup__intro">
      <h1>Xác minh email</h1>
    </div>
    <VerifySignup icons={signupIcons} />
  </main><SiteFooter /></>
}
