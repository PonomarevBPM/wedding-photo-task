# Текущая VPS: wedding-dinner.ru

Состояние проверено по SSH 15 октября 2026 года, без изменения настроек сервера. VPS работает на Ubuntu 22.04 x86_64. Nginx и Certbot уже установлены, HTTPS и автопродление настроены. Docker, Compose, `rsync`, пользователь `deploy` и каталог приложения пока отсутствуют.

| Компонент | Результат проверки |
| --- | --- |
| Nginx | Запущен, `nginx -t` проходит, проксирование на порт 3100 настроено |
| HTTPS | TLS-проверка проходит, приложение пока отвечает 502 |
| Автопродление сертификата | `snap.certbot.renew.timer` активен |
| Docker Engine и Compose | Не установлены |
| `rsync` | Не установлен, требуется для передачи файлов из Actions |
| SSH по ключу | Разрешён, стандартный порт 22 |
| Пользователь `deploy` и его SSH-ключ | Пользователь и `authorized_keys` отсутствуют |
| `/srv/wedding-tasks` и серверный `.env.local` | Отсутствуют |
| Репозиторий пакетов Docker | Доступен с VPS, проверочный запрос вернул HTTP 200 |

На сервере около 1 ГБ RAM, поэтому образ собирается на GitHub, а не на VPS. Конкретный адрес сервера, SSH-ключи и токены в эту инструкцию не записываются. Secrets GitHub в рамках SSH-проверки не проверялись.

## Что уже готово

- Домен `wedding-dinner.ru` направлен на VPS; HTTP перенаправляется на HTTPS.
- Сертификат покрывает `wedding-dinner.ru` и `www.wedding-dinner.ru`.
- Автопродление включено через Snap: `snap.certbot.renew.timer`.
- Рабочий сайт: `/etc/nginx/sites-available/default`, ссылка `/etc/nginx/sites-enabled/default`.
- Nginx проксирует запросы на `127.0.0.1:3100`; принимает запросы до 4 МБ и ждёт ответ до 90 секунд.
- Старые каталоги `VD`, `VO`, `DA`, `SA`, `GM`, `DS`, `NV` удалены пользователем после резервного копирования.

`nginx.conf` в этом каталоге — справочная копия применённого конфига. Не устанавливайте её как второй сайт для того же домена. При деплое приложения Nginx и сертификаты не меняются. Ограничение частоты отправок в текущем конфиге не настроено.

## Что осталось для запуска

1. Установить Docker Engine, Compose plugin и `rsync` на VPS.
2. Создать пользователя `deploy`, каталог приложения, установить отдельный SSH-ключ и заполнить `/srv/wedding-tasks/.env.local` токеном Диска.
3. Настроить secrets GitHub и запустить workflow из `main`.
4. Открыть `https://wedding-dinner.ru` и отправить фото с телефона.

Пошаговый основной сценарий: [GitHub Actions](GITHUB_ACTIONS.md). Docker-образ собирается на GitHub и передаётся на сервер по SSH. До запуска контейнера сайт может отвечать 502: Nginx уже настроен, но на порту 3100 нет приложения.

## Установка Docker

Выполните этот блок на VPS под root или пользователем с `sudo`. Он устанавливает отсутствующие Docker Engine, Compose plugin и `rsync` из соответствующих репозиториев:

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

Источник: [Docker Engine для Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Если обе команды версии в конце работают, переходите к созданию пользователя `deploy` в [инструкции Actions](GITHUB_ACTIONS.md#2-подготовить-ssh-доступ). Nginx и Certbot через apt здесь не устанавливаются: Certbot на этой VPS уже работает через Snap. Под root `sudo` можно опустить.

## Проверка существующих Nginx и HTTPS

Диагностические команды на VPS:

```sh
sudo nginx -t
systemctl is-active nginx
systemctl is-enabled snap.certbot.renew.timer
systemctl is-active snap.certbot.renew.timer
systemctl list-timers --all --no-pager snap.certbot.renew.timer
sudo certbot certificates
curl -I https://wedding-dinner.ru
```

Таймер называется `snap.certbot.renew.timer`, а не `certbot.timer`. Сертификаты находятся в `/etc/letsencrypt/live/wedding-dinner.ru/`. Порты 80 и 443 остаются открыты для сайта и проверки домена при продлении сертификата. Docker публикует порт приложения только на localhost: `127.0.0.1:3100:3000`.

## Управление приложением после деплоя

Посмотреть состояние и журналы:

```sh
cd /srv/wedding-tasks
sudo -u deploy bash -c 'export DEPLOY_IMAGE_TAG="$(cat .deployed-image)"; docker compose -f compose.yaml -f compose.deploy.yaml ps'
sudo -u deploy bash -c 'export DEPLOY_IMAGE_TAG="$(cat .deployed-image)"; docker compose -f compose.yaml -f compose.deploy.yaml logs --tail=100 app'
```

После изменения серверного `.env.local` пересоздайте контейнер без сборки:

```sh
cd /srv/wedding-tasks
sudo -u deploy bash -c 'export DEPLOY_IMAGE_TAG="$(cat .deployed-image)"; docker compose -f compose.yaml -f compose.deploy.yaml up -d --no-build --force-recreate app'
```

Чтобы закрыть приём, установите `PHOTO_UPLOADS_ENABLED=false` в `.env.local`, затем выполните команду выше. Для остановки приложения:

```sh
cd /srv/wedding-tasks
sudo -u deploy bash -c 'export DEPLOY_IMAGE_TAG="$(cat .deployed-image)"; docker compose -f compose.yaml -f compose.deploy.yaml stop app'
```

Фотографии остаются на Яндекс Диске. Новую версию приложения запускает push в `main`; Nginx перезагружать после обновления контейнера не требуется.

## Ручной запуск вместо Actions

Основной способ — GitHub Actions. Если нужно собрать приложение прямо на VPS, перенесите исходники в `/srv/wedding-tasks`, создайте `.env.local` по примеру `.env.example`, затем выполните:

```sh
cd /srv/wedding-tasks
sudo docker compose up -d --build
curl -I http://127.0.0.1:3100
```

Для ручной сборки используется основной `compose.yaml`; для образов из Actions — оба Compose-файла с SHA из `.deployed-image`. При переходе между способами сохраняйте соответствующую команду запуска. Публикуйте QR-код HTTPS-адреса после проверки отправки фото на телефоне и доступности в российских мобильных сетях.
