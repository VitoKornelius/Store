# Використовуємо офіційний образ Node.js
FROM node:22.14

# Встановлюємо робочу директорію в контейнері
WORKDIR /appBackend
# Копіюємо файли package.json і package-lock.json для встановлення залежностей
COPY package*.json ./

# Встановлюємо залежності
RUN npm install

# Копіюємо всі файли проєкту в контейнер
COPY . .

# Вказуємо порт, на якому працюватиме сервер
EXPOSE 5000

# Запускаємо сервер
CMD ["node", "server.js"]
