import type { Metadata } from 'next'
import { Icon } from '@/components/Icon.tsx'
import { SiteFooter } from '@/components/landing/SiteFooter.tsx'
import { SiteHeader } from '@/components/landing/SiteHeader.tsx'
import { SignInButton } from '@/components/signup/SignInButton.tsx'
import { SignupForm } from '@/components/signup/SignupForm.tsx'
import { signupIcons } from '@/components/signup/signup-icons.tsx'
import { createPageSeo } from '@/lib/seo/page-seo.ts'
import { pageMetadata } from '@/lib/seo/metadata.ts'
import '@/styles/signup.css'

// Built only with online documents on (`page.online.tsx`): sign-up exists for the online tier. A form: not indexed.
const SEO = createPageSeo('/dang-ky/', 'Tạo tài khoản PI ID', 'Đăng ký miễn phí tài khoản PI ID để lưu tài liệu online trên Văn phòng by ERPCons.')
export const metadata: Metadata = { ...pageMetadata(SEO), robots: { index: false, follow: false } }

export default function SignupPage() {
  return <><SiteHeader active="signup" /><main id="noi-dung" className="erp-container erp-signup">
    <div className="erp-signup__intro">
      <h1>Tạo tài khoản PI ID</h1>
      <p>Miễn phí. Dùng để lưu tài liệu online và mở lại ở thiết bị khác.</p>
    </div>
    <SignupForm icons={signupIcons} aside={<Aside />} />
  </main><SiteFooter /></>
}

function Aside() {
  return <aside className="erp-signup__aside" aria-labelledby="dang-ky-tiep-theo">
    <h2 id="dang-ky-tiep-theo">Sau khi gửi</h2>
    <ol className="erp-signup__steps">
      <li><strong>Xác minh email.</strong> Mở liên kết chúng tôi gửi tới hộp thư, trong vòng 48 giờ.</li>
      <li><strong>Đăng nhập bằng PI ID</strong> với email và mật khẩu vừa tạo.</li>
    </ol>
    <p className="erp-signup__fact"><Icon name="shield-lock" />
      <span>Văn phòng không lưu mật khẩu của bạn, chỉ giữ dạng mã băm cho tới khi PI ID tạo xong tài khoản.</span></p>
    <div className="erp-signup__existing">
      <p>Đã có tài khoản PI ID?</p>
      <SignInButton label="Đăng nhập" variant="secondary" />
    </div>
  </aside>
}
