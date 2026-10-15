# Деплой через GitHub Actions

Push в `main` собирает Docker-образ на GitHub, передаёт его на VPS по SSH и запускает приложение. Есть ручной запуск через Actions → Deploy to VPS → Run workflow. Образ маркируется SHA коммита; registry и доступ VPS к GitHub не нужны. Настройки Nginx, HTTPS и `.env.local` не заменяются при деплое.

По SSH-проверке 15 октября 2026 года VPS работает на Ubuntu 22.04 x86_64, Nginx уже направляет HTTPS-запросы на `127.0.0.1:3100`, сертификат установлен, автопродление включено через Snap. Не установлены Docker, Compose и `rsync`; не созданы пользователь `deploy`, его SSH-доступ, каталог приложения и серверный `.env.local`. Начинайте с шага 1. При деплое инфраструктура сайта не перенастраивается. Подробный результат проверки: [README.md](README.md).

## 1. Установить Docker, Compose и rsync на VPS

Выполните на VPS под root или пользователем с `sudo`:

```sh
sudo apt update
sudo apt install -y ca-certificates curl rsync nano
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
command -v rsync
```

Это установка Docker из [официального репозитория](https://docs.docker.com/engine/install/ubuntu/), а `rsync` и вспомогательных утилит — из Ubuntu. Обе команды версии в конце должны отработать успешно, `command -v rsync` должен показать путь к программе. Под root `sudo` можно опустить. Nginx и Certbot уже настроены и не требуют повторной установки. Проверка доступности репозитория Docker с этой VPS прошла.

## 2. Подготовить SSH-доступ

На своём компьютере, вне папки репозитория, создайте отдельный ключ без passphrase. На запрос пароля ключа нажмите Enter дважды; если файл с таким именем уже существует, выберите другое имя:

```sh
ssh-keygen -t ed25519 -C wedding-github-actions -f ./wedding-deploy-key
```

На VPS создайте отсутствующего пользователя деплоя и каталог приложения:

```sh
sudo adduser --disabled-password --gecos '' deploy
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy /srv/wedding-tasks
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
sudo -u deploy touch /home/deploy/.ssh/authorized_keys
sudo chmod 600 /home/deploy/.ssh/authorized_keys
sudo nano /home/deploy/.ssh/authorized_keys
```

Пользователь `deploy` управляет Docker, поэтому имеет административные возможности на VPS. Содержимое `wedding-deploy-key.pub` с компьютера вставьте в открытый на сервере `authorized_keys`, сохраните файл и закройте редактор. Приватный `wedding-deploy-key` понадобится для GitHub Secret; в репозиторий его не добавляйте. SSH-сервер уже разрешает вход по ключам, его конфигурацию менять не требуется.

Создайте серверное окружение:

```sh
sudo -u deploy touch /srv/wedding-tasks/.env.local
sudo chmod 600 /srv/wedding-tasks/.env.local
sudo nano /srv/wedding-tasks/.env.local
```

```dotenv
YANDEX_DISK_TOKEN=ваш_токен
YANDEX_DISK_ROOT=disk:/wedding
PHOTO_UPLOADS_ENABLED=true
```

После сохранения окружения проверьте со своего компьютера вход новым ключом и доступ к Docker, заменив `VPS_HOST` на адрес сервера:

```sh
ssh -i ./wedding-deploy-key deploy@VPS_HOST 'docker compose version && test -s /srv/wedding-tasks/.env.local && test -w /srv/wedding-tasks && printf "VPS ready\n"'
```

При первом подключении сверьте fingerprint SSH-сервера с выводом `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` на VPS. Ожидаемый итог — `VPS ready`, без запроса пароля пользователя `deploy`. Не переходите к workflow, если Docker недоступен пользователю или вход по ключу не работает.

## 3. Настроить GitHub

В своём репозитории откройте Settings → Secrets and variables → Actions → New repository secret:

| Secret | Значение |
| --- | --- |
| `SSH_HOST` | Адрес VPS, без `https://`; хранится только в secret |
| `SSH_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | Полное содержимое отдельного приватного SSH-ключа |
| `SSH_KNOWN_HOSTS` | Проверенная строка SSH host key сервера |

Если SSH работает не на 22-м порту, в разделе Variables задайте `SSH_PORT`.

Чтобы получить строку `SSH_KNOWN_HOSTS`, на VPS посмотрите публичный ключ сервера:

```sh
sudo cat /etc/ssh/ssh_host_ed25519_key.pub
```

Значение секрета для порта 22: `VPS_IP ssh-ed25519 AAAA…` — вместо `AAAA…` скопируйте второй столбец публичного ключа сервера. Для другого порта: `[VPS_IP]:PORT ssh-ed25519 AAAA…`. Имя/IP должны точно совпадать с `SSH_HOST`. Это публичный ключ сервера, не ключ пользователя `deploy`.

Документация: [GitHub — использование secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions).

## 4. Первый деплой приложения

Добавьте исходники и workflow в репозиторий, затем выполните push в `main`. Убедитесь, что `.env.local` и SSH-ключ не попали в коммит. Workflow также можно запустить вручную на `main`.

После успешного workflow на VPS появятся исходники в `/srv/wedding-tasks`, контейнер и файл `.deployed-image` с SHA последнего успешного запуска.

Откройте уже настроенный адрес `https://wedding-dinner.ru`: вместо 502 должно появиться приложение. Проверьте отправку фотографии с телефона. Nginx и Certbot для первого или последующих деплоев менять не требуется; повторно выпускать сертификат не нужно.

Рабочий сайт находится в `/etc/nginx/sites-available/default`, включён через `/etc/nginx/sites-enabled/default`. `deploy/nginx.conf` — справочная копия применённой конфигурации. Не создавайте второй server-блок для того же домена.

## 5. Обновления и откат

Для обновления — push в `main`. Деплои выполняются последовательно. Сборка идёт до изменения сервера; при неудачном запуске приложение возвращается к предыдущему успешному образу, если такой образ есть. Проверка готовности смотрит HTTP-ответ приложения, не проверяет камеру, HTTPS и Яндекс Диск. Автотесты workflow не запускает.

Менять только серверный токен или флаг приёма можно без новой сборки:

```sh
cd /srv/wedding-tasks
sudo -u deploy bash -c 'export DEPLOY_IMAGE_TAG="$(cat .deployed-image)"; docker compose -f compose.yaml -f compose.deploy.yaml up -d --no-build --force-recreate app'
```

Для ручного возврата к сохранённому образу:

```sh
sudo -u deploy bash /srv/wedding-tasks/deploy/deploy.sh SHA_НУЖНОГО_КОММИТА
```

Предыдущие образы сохраняются для отката; время от времени проверяйте свободное место. При автоматическом деплое используйте оба Compose-файла и `--no-build`: обычный `docker compose up --build` предназначен для ручной сборки из основной инструкции.
