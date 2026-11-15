/*
# Translate achievements to Russian

Updates achievement names and descriptions to Russian for the Russian-language UI.
*/

UPDATE achievements SET
  name = 'Первый бит',
  description = 'Создай свой первый бит'
WHERE name = 'First Beat';

UPDATE achievements SET
  name = 'Битмейкер',
  description = 'Создай 10 битов'
WHERE name = 'Beat Maker';

UPDATE achievements SET
  name = 'Студийная крыса',
  description = 'Запиши 5 аудиоклипов'
WHERE name = 'Studio Rat';

UPDATE achievements SET
  name = 'Душа компании',
  description = 'Отправь 50 сообщений в чате'
WHERE name = 'Social Butterfly';

UPDATE achievements SET
  name = 'Гейминг',
  description = 'Сыграй в любую игру'
WHERE name = 'Game On';

UPDATE achievements SET
  name = 'Рекордсмен',
  description = 'Набери 100+ очков в любой игре'
WHERE name = 'High Scorer';

UPDATE achievements SET
  name = 'Восходящая звезда',
  description = 'Достигни 5 уровня'
WHERE name = 'Rising Star';

UPDATE achievements SET
  name = 'Друзья',
  description = 'Добавь 3 друзей'
WHERE name = 'Make Friends';
