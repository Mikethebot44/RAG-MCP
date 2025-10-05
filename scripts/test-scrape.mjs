import { extractMarkdown } from '../dist/utils/extractMarkdown.js'

const url = process.argv[2] || 'https://docs.stripe.com/payments/accept-a-payment'

console.log(`Testing extractMarkdown on: ${url}`)

try {
  const result = await extractMarkdown(url, {
    mainContentOnly: true
  })
  const len = result.markdown?.length || 0
  console.log(`Length: ${len}`)
  console.log('Preview:\n')
  console.log(result.markdown?.slice(0, 800) || '[empty]')
} catch (e) {
  console.error('Error:', e?.message || e)
  process.exit(1)
}
