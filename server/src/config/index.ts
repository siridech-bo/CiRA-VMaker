import { config as dotenvConfig } from 'dotenv'

dotenvConfig()

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development'
}

export default config
