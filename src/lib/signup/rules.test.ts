import { describe, expect, it } from 'vitest'
import { emailError, nameError, NAME_MAX_CHARS, normalizeEmail, normalizeName, passwordError, validateSignup } from './rules.ts'

// The cases mirror `each_rule_names_its_field` in the server's crates/signup/src/input.rs.
describe('sign-up rules', () => {
  it('accepts a normal Vietnamese sign-up and normalizes it like the server', () => {
    expect(validateSignup({ name: '  Nguyễn Văn An ', email: ' An@Example.VN ', password: 'mật khẩu 1' })).toEqual({})
    expect(normalizeName('  Nguyễn Văn An ')).toBe('Nguyễn Văn An')
    expect(normalizeEmail(' An@Example.VN ')).toBe('an@example.vn')
  })

  it('names the field of each broken rule', () => {
    expect(nameError('')).not.toBeNull()
    expect(nameError('   ')).not.toBeNull()
    expect(nameError('a'.repeat(NAME_MAX_CHARS + 1))).not.toBeNull()
    expect(nameError('a'.repeat(NAME_MAX_CHARS))).toBeNull()
    expect(nameError('An\u0007')).not.toBeNull()
    expect(emailError('an')).not.toBeNull()
    expect(emailError('bính@x.vn')).toMatch(/không dấu/)
    expect(emailError('an@x')).not.toBeNull()
    expect(emailError('an@.x.vn')).not.toBeNull()
    expect(emailError('an@x..vn')).not.toBeNull()
    expect(emailError('a b@x.vn')).not.toBeNull()
    expect(emailError(`${'a'.repeat(65)}@x.vn`)).not.toBeNull()
    expect(emailError('an@x.vn')).toBeNull()
  })

  it('checks the password in characters and in bcrypt bytes, and not equal to the email', () => {
    expect(passwordError('', 'an@x.vn')).not.toBeNull()
    expect(passwordError('1234567', 'an@x.vn')).toMatch(/ít nhất 8/)
    expect(passwordError('đđđđđđđđ', 'an@x.vn')).toBeNull()
    expect(passwordError('đ'.repeat(37), 'an@x.vn')).toMatch(/quá dài/)
    expect(passwordError('a'.repeat(72), 'an@x.vn')).toBeNull()
    expect(passwordError('a'.repeat(73), 'an@x.vn')).not.toBeNull()
    expect(passwordError('An.Nguyen@X.vn', 'an.nguyen@x.vn')).toMatch(/trùng với email/)
  })

  it('reports every broken field at once, in form order', () => {
    expect(Object.keys(validateSignup({ name: '', email: 'x', password: '1' }))).toEqual(['name', 'email', 'password'])
  })
})
