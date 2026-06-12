import 'dotenv/config'
import { prisma } from '../src/lib/db'
main()
async function main() {
  await prisma.user.updateMany({ where: { email: 'michaelmartinez0996@gmail.com' }, data: { debeCambiarPassword: true } })
  console.log('flag restaurada')
  process.exit(0)
}
