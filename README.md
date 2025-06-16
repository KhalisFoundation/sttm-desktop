# SikhiToTheMax Desktop App

Originally developed by SHARE Charity UK, SikhiToTheMax has become a de facto standard for Keertans and Gurdwaras around the world to display Gurbani on screens for Sangat to join into the depth of Gurbani and translations.

SikhiToTheMax is now developed by Khalis Foundation as Seva to the Panth and Khalis Foundation is working hard to ensure it lives up to its name.
Khalis Foundation Sevadaars are currently working hard to build a newer version of SikhiToTheMax app using modern technologies.

Download: https://khalisfoundation.org/portfolio/sikhitothemax/

Developer: Khalis Foundation and sevadars (see committers for more details)

Acknowledgements: Bhai Tarsem Singh UK, SHARE UK, Khalis Foundation, Khalsa Foundation UK, Dr. Sant Singh Khalsa, Dr. Kulbir Singh Thind

Powered by [<img height="30" src="http://www.banidb.com/wp-content/uploads/2018/03/full-banidb-logo.png">](http://banidb.com)

[![Build macOS App](https://github.com/KhalisFoundation/sttm-desktop/actions/workflows/build-mac.yml/badge.svg)](https://github.com/KhalisFoundation/sttm-desktop/actions/workflows/build-mac.yml)
[![Build Windows App](https://github.com/KhalisFoundation/sttm-desktop/actions/workflows/build-windows.yml/badge.svg)](https://github.com/KhalisFoundation/sttm-desktop/actions/workflows/build-windows.yml)

## Prerequisites

1.  [Node v18](https://nodejs.org/en/download/)
2.  [Github SSH Key Setup](https://help.github.com/articles/connecting-to-github-with-ssh/)

## Build Instructions

Make sure you've [`git`](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) & [`nodejs`](https://nodejs.org/en/) installed in your system.

Open terminal and follow these steps;

- **Step 1**: Clone the repo.

```bash
git clone https://github.com/KhalisFoundation/sttm-desktop/
```

You should now see a `sttm-desktop` folder in your present working directory. Let's change directory to it.

```bash
cd sttm-desktop/
```

- **Step 2**: Setup python version 3.12.
  - Install Python 3.12 (if not already installed)
  - On mac:
  ```bash
  brew install python@3.12
  ```
  - On Linux
  ```bash
  sudo add-apt-repository ppa:deadsnakes/ppa
  sudo apt update
  sudo apt install python3.12 python3.12-venv
  ```

  - Create an isolated virtual environment
  ```bash
  /path/to/python3.12 -m venv myenv
  ```

  - Activate it
  ```bash
  source myenv/bin/activate
  ```

- **Step 3**: Setup node version 18
  - Install nvm (if not already installed)
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  ```
  - Restart the terminal or run the following to activate
  ```bash
  export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm
  ```

  - Install node 18.18 using nvm
  ```bash
  nvm install 18.18
  ``` 
  - Switch to node 18
  ```bash
  nvm use 18.18
  ``` 

- **Step 4**: Install dependencies.

```bash
# `ci` doesn't update package.json, and uses package-lock.json to install intended deps.
# This makes it pretty speedy and doesn't cause unintended updates.
npm ci
```

This will use `npm` that is included with `nodejs` to install project dependencies.

- **Step 5**: Start the project.

```bash
npm start
```


## Packaging

Create the app package for your system:

- **macOS** - Run `npm run pack:mac`
- **Windows 64-bit** - Run `npm run pack:win`
- **Windows 32-bit** - Run `npm run pack:win32`
- **Linux/Ubuntu 64-bit** - Run `npm run pack:linux`

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md)
