export const event = {
  id: "wedding",
  title: "Любовь в кадре",
  subtitle: "Маленькие задания. Большие воспоминания.",
};

export const tasks = [
  { id: "groom-smile", title: "Поймай улыбку жениха", description: "Сфотографируй, как жених улыбается.", hint: "Самые искренние улыбки — когда никто не позирует.", symbol: "✧" },
  { id: "groom-friends", title: "Объятия с друзьями", description: "Поймай момент, когда жених обнимается с друзьями.", hint: "Пусть в кадре будет побольше тепла и дружбы.", symbol: "♡" },
  { id: "bride-friends", title: "Невеста и её подруги", description: "Сфотографируй невесту с подругами.", hint: "Смех, разговоры или танцы — выбирай свой момент.", symbol: "❀" },
  { id: "couple-selfie", title: "Ты и молодожёны", description: "Сделай совместное фото с молодожёнами.", hint: "Селфи или фото с помощью друга — главное, быть вместе.", symbol: "◎" },
] as const;

export type Task = (typeof tasks)[number];
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_NAME_LENGTH = 80;

export function randomTask(currentId?: string): Task {
  const options = tasks.filter((task) => task.id !== currentId);
  return options[Math.floor(Math.random() * options.length)] ?? tasks[0];
}
