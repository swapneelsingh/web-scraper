#!/bin/bash

# Automated setup script for Jira LLM Scraper
# Run: bash setup.sh

echo "🚀 Setting up Jira LLM Scraper..."

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p src/scraper
mkdir -p src/queue
mkdir -p scripts
mkdir -p tests
mkdir -p output
mkdir -p checkpoints

# Create .gitkeep files
touch output/.gitkeep
touch checkpoints/.gitkeep

# Create package.json
echo "📦 Creating package.json..."
cat > package.json << 'EOF'
{
  "name": "jira-llm-scraper",
  "version": "1.0.0",
  "description": "Production-grade Apache Jira scraper for LLM training data",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "monitor": "ts-node scripts/monitor.ts",
    "clean": "rm -rf dist output/*.jsonl checkpoints/*.json",
    "test": "jest",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write \"src/**/*.ts\"",
    "docker:build": "docker build -t jira-scraper .",
    "docker:run": "docker run --rm -v $(pwd)/output:/app/output -v $(pwd)/checkpoints:/app/checkpoints jira-scraper"
  },
  "keywords": ["jira", "scraper", "llm", "web-scraping"],
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "axios": "^1.6.2",
    "axios-retry": "^4.0.0",
    "dotenv": "^16.3.1",
    "p-limit": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.5",
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0",
    "eslint": "^8.56.0",
    "jest": "^29.7.0",
    "prettier": "^3.1.1",
    "ts-jest": "^29.1.1",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF

# Create tsconfig.json
echo "⚙️  Creating tsconfig.json..."
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# Create .env.example
echo "🔐 Creating .env.example..."
cat > .env.example << 'EOF'
JIRA_BASE_URL=https://issues.apache.org/jira
JIRA_PROJECTS=HADOOP,KAFKA,SPARK
MAX_CONCURRENT=5
MAX_RESULTS=100
REQUEST_TIMEOUT=30000
RATE_LIMIT_DELAY=1000
OUTPUT_DIR=./output
CHECKPOINT_DIR=./checkpoints
NODE_ENV=production
EOF

# Copy to .env
cp .env.example .env

# Create .gitignore
echo "🚫 Creating .gitignore..."
cat > .gitignore << 'EOF'
node_modules/
package-lock.json
dist/
.env
output/*.jsonl
checkpoints/*.json
!output/.gitkeep
!checkpoints/.gitkeep
*.log
.DS_Store
coverage/
EOF

# Create .eslintrc.json
cat > .eslintrc.json << 'EOF'
{
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "no-console": "off"
  },
  "env": {
    "node": true,
    "es2022": true
  }
}
EOF

# Create .prettierrc
cat > .prettierrc << 'EOF'
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
EOF

# Create jest.config.js
cat > jest.config.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
  coverageDirectory: 'coverage'
};
EOF

echo ""
echo "✅ Project structure created!"
echo ""
echo "📝 Next steps:"
echo "1. Copy the TypeScript source files from the artifacts"
echo "2. Run: npm install"
echo "3. Run: npm run build"
echo "4. Run: npm start"
echo ""
echo "💡 Tip: Use 'npm run monitor' in a separate terminal to watch progress"