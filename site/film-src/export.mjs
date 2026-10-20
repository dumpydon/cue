/* Reproduce the 34-second Cue photographic production edit. */
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const dir=path.dirname(fileURLToPath(import.meta.url));
const localPython=path.join(dir,'.venv/bin/python');
const python=process.env.PYTHON_BIN||(fs.existsSync(localPython)?localPython:'python3');
const child=spawn(python,[path.join(dir,'create_launch_video.py'),...process.argv.slice(2)],{stdio:'inherit',cwd:dir});
child.on('exit',code=>process.exit(code??1));
child.on('error',error=>{console.error(error);process.exit(1)});
