const { spawn } = require('child_process');

function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'inherit' });
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                const error = new Error(`Command failed with code ${code}`);
                error.code = 'ECOMMANDFAILED';
                reject(error);
            }
        });
        child.on('error', (err) => {
            reject(err);
        });
    });
}

async function installSuperClaude() {
    const installArgs = ['install', '--yes', '--components', 'mcp', 'core', 'agents', 'mcp_docs', 'modes', 'commands'];

    try {
        console.log('Attempting to install SuperClaude using pip...');
        await runCommand('pip', ['install', 'SuperClaude']);
        await runCommand('SuperClaude', installArgs);
        console.log('SuperClaude installed successfully using pip.');
        return;
    } catch (error) {
        if (error.code === 'ENOENT') {
            // pip is not found, try pipx
            console.log('pip not found. Attempting to install SuperClaude using pipx...');
            try {
                await runCommand('pipx', ['run', 'SuperClaude', ...installArgs]);
                console.log('SuperClaude installed successfully using pipx.');
            } catch (pipxError) {
                if (pipxError.code === 'ENOENT') {
                    // pipx is also not found
                    console.warn('------------------------------------------------------------');
                    console.warn('WARNING: SuperClaude framework could not be installed.');
                    console.warn("Neither 'pip' nor 'pipx' was found on your system.");
                    console.warn('Please install Python and pip/pipx to enable SuperClaude features.');
                    console.warn('You can still use happy-cli, but the enhanced features from');
                    console.warn('SuperClaude will not be available.');
                    console.warn('------------------------------------------------------------');
                } else {
                    console.warn('WARNING: SuperClaude installation via pipx failed.');
                }
            }
        } else {
            console.warn('WARNING: SuperClaude installation via pip failed.');
        }
    }
}

installSuperClaude();
