// Loaded FIRST (before any module that reads process.env) so dotenv runs
// before openai/anthropic clients are instantiated at import time.
// esbuild/tsx hoists imports, so env loading must live in its own module
// imported before the others - a plain dotenv.config() in index.ts runs too late.
import dotenv from 'dotenv'
import path from 'path'

// Anchor to this file's location so it loads regardless of the process cwd
// (the dev/preview launcher may run from the project root, not backend/).
dotenv.config({ path: path.resolve(__dirname, '../.env') })
// Fallback to default cwd-based resolution as well.
dotenv.config()
