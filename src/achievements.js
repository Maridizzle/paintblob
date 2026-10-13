// Idle-clicker style achievements: long tiered ladders so there is always a
// next one visible, plus a handful of hidden ones for texture.
//
// Anything with `track` is a plain counter against `goal` and shows a progress
// bar. Anything with `event` is unlocked by the game calling award() directly.
// `hint` is how many hints unlocking it grants — defaults to 1 when absent.
// `outfit`, when present, is a WARDROBE_ITEMS id unlocked alongside the hints.

export const ACHIEVEMENTS = [
  // --- the main ladder ------------------------------------------------------
  { id: 'blob-1', icon: '🎨', name: 'First Blob', desc: 'Fill your very first cell.', track: 'cells', goal: 1 },
  { id: 'blob-10', icon: '💧', name: 'Getting Messy', desc: 'Fill 10 cells.', track: 'cells', goal: 10 },
  { id: 'blob-50', icon: '🖌️', name: 'Sploosh', desc: 'Fill 50 cells.', track: 'cells', goal: 50 },
  { id: 'blob-250', icon: '🪣', name: 'Bucket Brigade', desc: 'Fill 250 cells.', track: 'cells', goal: 250 },
  { id: 'blob-1000', icon: '🌊', name: 'Tidal Wave', desc: 'Fill 1,000 cells.', track: 'cells', goal: 1000, outfit: 'shoes-boots' },
  { id: 'blob-5000', icon: '🌋', name: 'Chromatic Eruption', desc: 'Fill 5,000 cells.', track: 'cells', goal: 5000 },
  { id: 'blob-25000', share: true, icon: '🏆', name: 'Pigment Deity', desc: 'Fill 25,000 cells.', track: 'cells', goal: 25000 },
  { id: 'blob-100000', share: true, icon: '🌌', name: 'Chromatic Singularity', desc: 'Fill 100,000 cells.', track: 'cells', goal: 100000, hint: 25 },

  // --- pictures -------------------------------------------------------------
  { id: 'pic-1', icon: '🖼️', name: 'Framed', desc: 'Finish a picture.', track: 'puzzles', goal: 1 },
  { id: 'pic-3', icon: '🏛️', name: 'Small Gallery', desc: 'Finish 3 pictures.', track: 'puzzles', goal: 3 },
  { id: 'pic-10', icon: '🎭', name: 'Curator', desc: 'Finish 10 pictures.', track: 'puzzles', goal: 10, outfit: 'dress-flowy' },
  { id: 'pic-25', icon: '👑', name: 'Old Master', desc: 'Finish 25 pictures.', track: 'puzzles', goal: 25, outfit: 'dress-gown' },
  { id: 'pic-50', icon: '🖨️', name: 'Print Run', desc: 'Finish 50 pictures.', track: 'puzzles', goal: 50, hint: 12 },
  { id: 'pic-100', share: true, icon: '🏅', name: 'Century', desc: 'Finish 100 pictures.', track: 'puzzles', goal: 100, hint: 20 },

  // --- habits ---------------------------------------------------------------
  { id: 'switch-100', icon: '🔀', name: 'Indecisive', desc: 'Switch paint tubs 100 times.', track: 'colourSwitches', goal: 100 },
  { id: 'switch-1000', icon: '🦋', name: 'Butterfly', desc: 'Switch paint tubs 1,000 times.', track: 'colourSwitches', goal: 1000, hint: 3 },
  { id: 'time-1h', icon: '⏳', name: 'Lost an Hour', desc: 'Spend an hour painting.', track: 'seconds', goal: 3600 },
  { id: 'time-10h', icon: '🕰️', name: 'Where Did the Week Go', desc: 'Spend ten hours painting.', track: 'seconds', goal: 36000 },
  { id: 'time-24h', icon: '🌗', name: 'Around the Clock', desc: 'Spend a full day painting.', track: 'seconds', goal: 86400, hint: 8 },
  { id: 'time-100h', share: true, icon: '🏔️', name: 'Lifer', desc: 'Spend 100 hours painting.', track: 'seconds', goal: 360000, hint: 15 },

  // --- showing up -------------------------------------------------------------
  { id: 'days-3', icon: '📅', name: 'Regular', desc: 'Open paintblob on 3 different days.', track: 'daysVisited', goal: 3 },
  { id: 'days-7', icon: '🗓️', name: 'Weekly Ritual', desc: 'Open paintblob on 7 different days.', track: 'daysVisited', goal: 7, hint: 2 },
  { id: 'days-30', icon: '📆', name: 'Creature of Habit', desc: 'Open paintblob on 30 different days.', track: 'daysVisited', goal: 30, hint: 5 },

  // --- bringing your own ------------------------------------------------------
  { id: 'import-1', icon: '📸', name: 'Bring Your Own', desc: 'Add a picture of your own.', track: 'imported', goal: 1 },
  { id: 'import-10', icon: '🗂️', name: 'Personal Collection', desc: 'Add 10 pictures of your own.', track: 'imported', goal: 10, hint: 3 },
  { id: 'import-25', icon: '🗄️', name: 'Archivist', desc: 'Add 25 pictures of your own.', track: 'imported', goal: 25, hint: 5 },

  // --- skill / flow ---------------------------------------------------------
  { id: 'combo-15', icon: '⚡', name: 'On a Roll', desc: 'Fill 15 cells in a row without a wrong tub.', event: true },
  { id: 'combo-40', icon: '🔥', name: 'Unbroken', desc: 'Fill 40 cells in a row without a wrong tub.', event: true },
  { id: 'combo-80', icon: '🎯', name: 'In the Zone', desc: 'Fill 80 cells in a row without a wrong tub.', event: true, hint: 4 },
  { id: 'rapid-10', icon: '🐇', name: 'Twitchy', desc: 'Fill 10 cells in 10 seconds.', event: true },
  { id: 'tub-empty', icon: '🫗', name: 'Squeezed Dry', desc: 'Use up every cell of one colour.', event: true },
  { id: 'flawless', icon: '💎', name: 'Flawless', desc: 'Finish a picture with no wrong-tub clicks.', event: true },
  { id: 'speedrun', icon: '⏱️', name: 'Wet on Wet', desc: 'Finish a picture in under 90 seconds.', event: true },

  // --- hints --------------------------------------------------------------
  { id: 'hint-earn-10', icon: '🐷', name: 'Piggy Bank', desc: 'Earn 10 hints.', track: 'hintsEarned', goal: 10 },
  { id: 'hint-earn-50', icon: '💰', name: 'Rainy Day Fund', desc: 'Earn 50 hints.', track: 'hintsEarned', goal: 50, hint: 2 },
  { id: 'hint-use-25', icon: '✨', name: 'Little Help', desc: 'Use 25 hints.', track: 'hintsUsed', goal: 25 },

  // --- hidden ---------------------------------------------------------------
  { id: 'night-owl', icon: '🦉', name: 'Night Shift', desc: 'Paint something after 2am.', event: true, hidden: true },
  { id: 'early-bird', icon: '🐦', name: 'Early Bird', desc: 'Paint something before 6am.', event: true, hidden: true },
  { id: 'patient', icon: '🧘', name: 'Unhurried', desc: 'Let 25 blobs land without clicking mid-flight.', track: 'patientLandings', goal: 25, hidden: true },
  { id: 'ghost', icon: '🤫', name: 'Silent Treatment', desc: 'Fill 20 cells with the sound off.', track: 'mutedCells', goal: 20, hidden: true },
  { id: 'rapid-20', icon: '💨', name: 'Blur', desc: 'Fill 20 cells in 10 seconds.', event: true, hidden: true, hint: 2 },
  { id: 'import-photo', icon: '🎞️', name: 'Straight From Life', desc: 'Import a real photograph, grain and all.', event: true, hidden: true, hint: 2 },
  { id: 'stockpile', icon: '🏦', name: 'Stockpile', desc: 'Hold 20 unspent hints at once.', track: 'hints', goal: 20, hidden: true },
  { id: 'unassisted', icon: '🙅', name: 'Unassisted', desc: 'Finish a picture without using a hint.', event: true, hidden: true, hint: 2 },
  { id: 'free-spirit', icon: '🕊️', name: 'Free Spirit', desc: 'Toggle always-on-top.', event: true, hidden: true },
  { id: 'fine-print', icon: '🔬', name: 'Fine Print', desc: 'Finish a picture with 100 or more cells.', event: true, hidden: true, hint: 2 },
  { id: 'minimalist', icon: '⬛', name: 'Minimalist', desc: 'Finish a picture with fewer than 12 cells.', event: true, hidden: true },


  // =========================================================================
  // The second wave. These pay POINTS, not hints (the hint stockpile is already
  // deep), set by `tier` below: small 25, mid 150, big 500. A `big` entry is
  // also a Shareable Award. Counters named here that the game does not keep yet
  // are wired in game.js; event ids are fired from the place the thing happens.
  // =========================================================================

  // --- painting ---------------------------------------------------------------
  { id: 'pic-500', icon: '🧱', name: 'Marathon Picture', desc: 'Finish a picture of 500 or more cells.', event: true, tier: 'mid' },
  { id: 'pic-1000', icon: '🏗️', name: 'Big Picture', desc: 'Finish a picture of 1,000 or more cells.', event: true, tier: 'mid' },
  { id: 'pts-1k', icon: '🪙', name: 'Point Collector', desc: 'Earn 1,000 points.', track: 'pointsEarned', goal: 1000, tier: 'small' },
  { id: 'pts-25k', icon: '👛', name: 'Point Hoarder', desc: 'Earn 25,000 points.', track: 'pointsEarned', goal: 25000, tier: 'mid' },
  { id: 'oops-100', icon: '🙈', name: 'Happy Accidents', desc: 'Tap the wrong colour 100 times.', track: 'wrongTaps', goal: 100, tier: 'small' },
  { id: 'undo-50', icon: '↩️', name: 'Ctrl+Z Enthusiast', desc: 'Undo 50 times.', track: 'undos', goal: 50, tier: 'small' },
  { id: 'undo-500', icon: '🌀', name: 'Undo Spiral', desc: 'Undo 500 times.', track: 'undos', goal: 500, tier: 'mid' },
  { id: 'fill-styles', icon: '🫧', name: 'Fill Stylist', desc: 'Paint 10 cells in each of the 5 fill styles.', track: 'fillStylesTried', goal: 5, tier: 'mid' },
  { id: 'pic-fast-100', icon: '🏎️', name: 'Speed Demon', desc: 'Finish a picture of 100 or more cells in under 5 minutes.', event: true, tier: 'mid' },
  { id: 'pic-slow-burn', icon: '🕯️', name: 'Slow Burn', desc: 'Finish a picture you started at least 7 days earlier.', event: true, tier: 'small' },

  // --- streaks and time ---------------------------------------------------------
  { id: 'streak-3', icon: '🔗', name: 'Three in a Row', desc: 'Open paintblob 3 days in a row.', track: 'bestDayStreak', goal: 3, tier: 'small' },
  { id: 'streak-7', icon: '🗡️', name: 'Week Warrior', desc: 'Open paintblob 7 days in a row.', track: 'bestDayStreak', goal: 7, tier: 'small' },
  { id: 'streak-14', icon: '🌙', name: 'Fortnight', desc: 'Open paintblob 14 days in a row.', track: 'bestDayStreak', goal: 14, tier: 'mid' },
  { id: 'streak-30', icon: '🌈', name: 'Month of Colour', desc: 'Open paintblob 30 days in a row.', track: 'bestDayStreak', goal: 30, tier: 'big' },
  { id: 'streak-100', icon: '♾️', name: 'Unstoppable', desc: 'Open paintblob 100 days in a row.', track: 'bestDayStreak', goal: 100, tier: 'big' },
  { id: 'weekend', icon: '🧺', name: 'Weekend Painter', desc: 'Paint on both the Saturday and the Sunday of one weekend.', event: true, tier: 'small' },
  { id: 'session-2h', icon: '🛋️', name: 'Marathon Session', desc: 'Paint for 2 hours without a 10 minute break.', event: true, tier: 'mid' },
  { id: 'comeback', icon: '🧳', name: 'Come Back Kid', desc: 'Return after 30 or more days away.', event: true, tier: 'small', hidden: true },
  { id: 'midnight', icon: '🕛', name: 'Midnight Oil', desc: 'Paint right through midnight.', event: true, tier: 'small', hidden: true },

  // --- bonus rounds -------------------------------------------------------------
  { id: 'bonus-overtime', icon: '⏰', name: 'Beat the Clock', desc: 'Win an Overtime round.', event: true, tier: 'small' },
  { id: 'bonus-shade', icon: '👁️', name: 'Good Eye', desc: 'Win a Shade Match round.', event: true, tier: 'small' },
  { id: 'bonus-mixer', icon: '🧪', name: 'Mad Scientist', desc: 'Win a Colour Mixer round.', event: true, tier: 'small' },
  { id: 'bonus-drips', icon: '🎣', name: 'Catch of the Day', desc: 'Win a Drip Catch round.', event: true, tier: 'small' },
  { id: 'bonus-recall', icon: '🐘', name: 'Elephant Memory', desc: 'Win a Palette Memory round.', event: true, tier: 'small' },
  { id: 'bonus-swap', icon: '🔄', name: 'Quick Switch', desc: 'Win The Swap in story mode.', event: true, tier: 'small' },
  { id: 'bonus-all', icon: '🎪', name: 'Round Robin', desc: 'Win every kind of bonus round at least once.', event: true, tier: 'big' },
  { id: 'bonus-streak-3', icon: '🎰', name: 'Hot Streak', desc: 'Win 3 bonus rounds in a row.', event: true, tier: 'mid' },
  { id: 'bonus-25', icon: '🎲', name: 'Bonus Fan', desc: 'Win 25 bonus rounds.', track: 'bonusWins', goal: 25, tier: 'mid' },
  { id: 'bonus-100', icon: '👑', name: 'Bonus Legend', desc: 'Win 100 bonus rounds.', track: 'bonusWins', goal: 100, tier: 'big' },
  { id: 'perk-50', icon: '🎁', name: 'Perk Spender', desc: 'Use up 50 bonus perk charges.', track: 'perkCharges', goal: 50, tier: 'small' },
  { id: 'bonus-no', icon: '🚪', name: 'Not Now', desc: 'Let 10 bonus round offers drift past.', track: 'bonusDismissed', goal: 10, tier: 'small', hidden: true },

  // --- story and bosses -----------------------------------------------------------
  { id: 'story-start', icon: '📖', name: 'Once Upon a Cloth', desc: 'Begin the story.', event: true, tier: 'small' },
  { id: 'story-3', icon: '🪨', name: 'Stone Hopper', desc: 'Finish 3 story stones.', track: 'storyStones', goal: 3, tier: 'small' },
  { id: 'story-six', icon: '🧵', name: 'Seamstress', desc: 'Finish all six non-boss stones of Chapter One.', track: 'storyStones', goal: 6, tier: 'mid' },
  { id: 'story-boss', icon: '🎭', name: 'The Wrong-Colour Day', desc: 'Beat the Chapter One boss.', event: true, tier: 'big' },
  { id: 'boss-nohint', icon: '🧤', name: 'Hands Off', desc: 'Beat a boss without using a hint.', event: true, tier: 'mid' },
  { id: 'boss-fast', icon: '🪡', name: 'Quick Stitch', desc: 'Beat a boss in under 10 minutes.', event: true, tier: 'mid' },
  { id: 'boss-frozen', icon: '🧊', name: 'Ice Breaker', desc: 'Get frozen by a boss 5 times and still win.', event: true, tier: 'mid' },
  { id: 'story-scenes', icon: '🎬', name: 'Front Row', desc: 'See every cutscene in Chapter One.', event: true, tier: 'mid' },
  { id: 'story-epilogue', icon: '🌅', name: 'Epilogue', desc: 'Watch the Chapter One epilogue to the end.', event: true, tier: 'small' },

  // --- wardrobe, avatar and house -----------------------------------------------------
  { id: 'wear-5', icon: '🪞', name: 'Fitting Room', desc: 'Own 5 garments.', track: 'garmentsOwned', goal: 5, tier: 'small' },
  { id: 'wear-25', icon: '🚪', name: 'Walk-in Wardrobe', desc: 'Own 25 garments.', track: 'garmentsOwned', goal: 25, tier: 'mid' },
  { id: 'wear-50', icon: '💃', name: 'Fashion Victim', desc: 'Own 50 garments.', track: 'garmentsOwned', goal: 50, tier: 'big' },
  { id: 'head-to-toe', icon: '🧥', name: 'Head to Toe', desc: 'Wear a hat, glasses, a neck piece, outerwear, socks, shoes and a full outfit all at once.', event: true, tier: 'mid' },
  { id: 'atelier', icon: '🧑‍🎨', name: "Painter's Studio", desc: 'Wear a full Atelier outfit.', event: true, tier: 'mid' },
  { id: 'outfit-20', icon: '👗', name: 'Quick Change', desc: 'Change your outfit 20 times.', track: 'outfitChanges', goal: 20, tier: 'small' },
  { id: 'new-do', icon: '💇', name: 'New Do', desc: 'Change your hair style.', event: true, tier: 'small' },
  { id: 'hair-dye', icon: '🎨', name: 'Hair Dye', desc: 'Recolour 10 things on your avatar.', track: 'recolours', goal: 10, tier: 'small' },
  { id: 'whiskers', icon: '🧔', name: 'Whiskers', desc: 'Give your avatar facial hair.', event: true, tier: 'small' },
  { id: 'home-10', icon: '🛠️', name: 'Home Improvements', desc: 'Change something in your room 10 times.', track: 'roomChanges', goal: 10, tier: 'small' },

  // --- special paints and stickers ---------------------------------------------------------
  { id: 'paint-first', icon: '🛍️', name: 'Specialty Paint', desc: 'Buy your first special paint.', event: true, tier: 'small' },
  { id: 'rainbow-25', icon: '🌈', name: 'Over the Rainbow', desc: 'Paint 25 cells with rainbow paint.', track: 'rainbowCells', goal: 25, tier: 'small' },
  { id: 'shimmer-25', icon: '✨', name: 'Shimmer Shimmer', desc: 'Paint 25 cells with shimmer paint.', track: 'shimmerCells', goal: 25, tier: 'small' },
  { id: 'oil-25', icon: '🛢️', name: 'Oil Slick', desc: 'Paint 25 cells with oil-slick paint.', track: 'oilCells', goal: 25, tier: 'small' },
  { id: 'paint-all-three', icon: '🎡', name: 'Triple Threat', desc: 'Use all three special paints on one picture.', event: true, tier: 'mid' },
  { id: 'sticker-1', icon: '🏷️', name: 'First Sticker', desc: 'Place your first sticker.', event: true, tier: 'small' },
  { id: 'sticker-25', icon: '🌟', name: 'Sticker Shock', desc: 'Place 25 stickers.', track: 'stickersPlaced', goal: 25, tier: 'small' },
  { id: 'sticker-100', icon: '💥', name: 'Sticker Bomb', desc: 'Place 100 stickers.', track: 'stickersPlaced', goal: 100, tier: 'big' },
  { id: 'sticker-finish', icon: '🎀', name: 'Finishing Touch', desc: 'Put a sticker on a finished picture.', event: true, tier: 'small' },
  { id: 'sticker-kinds', icon: '🔟', name: 'Ten Different', desc: 'Use 10 different stickers.', track: 'stickerKinds', goal: 10, tier: 'mid' },

  // --- replay and sharing -----------------------------------------------------------------------
  { id: 'replay-1', icon: '⏪', name: 'Rewind', desc: 'Watch a replay of a finished picture.', event: true, tier: 'small' },
  { id: 'replay-warp', icon: '⚡', name: 'Warp Speed', desc: 'Watch a replay at warp speed.', event: true, tier: 'small' },
  { id: 'save-1', icon: '💾', name: 'Save It', desc: 'Save a picture as an image.', event: true, tier: 'small' },
  { id: 'share-1', icon: '📣', name: 'Show Off', desc: 'Share a finished picture.', event: true, tier: 'small' },
  { id: 'share-award', icon: '🥇', name: 'Proud Moment', desc: 'Share an award.', event: true, tier: 'small' },
  { id: 'share-10', icon: '🗣️', name: 'Word of Mouth', desc: 'Share 10 times.', track: 'shares', goal: 10, tier: 'mid' },
  { id: 'save-25', icon: '🖼️', name: 'Gallery Wall', desc: 'Save 25 images.', track: 'imagesSaved', goal: 25, tier: 'mid' },
  { id: 'replay-3', icon: '🔁', name: 'Encore', desc: 'Replay the same picture 3 times.', event: true, tier: 'small' },

  // --- themes, settings and moving around -----------------------------------------------------------
  { id: 'themes-3', icon: '🛋️', name: 'Redecorate', desc: 'Try 3 different themes.', track: 'themesTried', goal: 3, tier: 'small' },
  { id: 'themes-all', icon: '🏳️‍🌈', name: 'Full Palette', desc: 'Unlock every theme.', event: true, tier: 'mid' },
  { id: 'dark-mode', icon: '🌑', name: 'After Dark', desc: 'Turn on dark mode.', event: true, tier: 'small' },
  { id: 'low-stim-on', icon: '🍃', name: 'Gentle Mode', desc: 'Turn on low-stim mode.', event: true, tier: 'small' },
  { id: 'backup', icon: '🗄️', name: 'Backup Brain', desc: 'Download a backup of your save.', event: true, tier: 'small' },
  { id: 'cloud', icon: '☁️', name: 'Cloud Nine', desc: 'Sign in to a cloud account.', event: true, tier: 'small' },
  { id: 'glide-60', icon: '🧭', name: 'Smooth Operator', desc: 'Glide with the arrow pad for 60 seconds in total.', track: 'glideSeconds', goal: 60, tier: 'small' },
  { id: 'pad-moved', icon: '🧹', name: 'Tidy Desk', desc: 'Drag the arrow pad out of the way.', event: true, tier: 'small' },
  { id: 'zoom-max', icon: '🔭', name: 'Zoom Zoom', desc: 'Zoom all the way in.', event: true, tier: 'small' },

  // --- Pip -------------------------------------------------------------------------------------------------
  { id: 'pip-1', icon: '🐿️', name: 'Hello Pip', desc: 'Give Pip a tap.', event: true, tier: 'small' },
  { id: 'pip-100', icon: '🌰', name: 'Squirrel Whisperer', desc: 'Tap Pip 100 times.', track: 'pipTaps', goal: 100, tier: 'mid' },
  { id: 'pip-moved', icon: '🏡', name: 'Rehoming', desc: 'Drag Pip somewhere new.', event: true, tier: 'small' },
  { id: 'pip-critic', icon: '🧐', name: 'Colour Critic', desc: 'Hear 25 colour comments from Pip.', track: 'pipColourComments', goal: 25, tier: 'small' },
  { id: 'pip-off', icon: '🤐', name: 'Solo Artist', desc: 'Turn Pip off, then paint 100 cells.', track: 'soloCells', goal: 100, tier: 'small', hidden: true },
  { id: 'pip-audience', icon: '👀', name: 'Audience', desc: 'Finish a picture with Pip watching.', event: true, tier: 'small' },

  // --- the library -------------------------------------------------------------------------------------------
  { id: 'redeem', icon: '🔑', name: 'Code Breaker', desc: 'Redeem a pack code.', event: true, tier: 'small' },
  { id: 'own-finish', icon: '📷', name: 'Photo Finish', desc: 'Finish a picture you added yourself.', event: true, tier: 'small' },
  { id: 'free-10', icon: '🕊️', name: 'Free and Easy', desc: 'Finish 10 pictures in free mode.', track: 'freeFinished', goal: 10, tier: 'small' },
  { id: 'collections-5', icon: '🧭', name: 'Well Travelled', desc: 'Finish pictures from 5 different collections.', track: 'collectionsFinished', goal: 5, tier: 'mid' },
  { id: 'restore', icon: '🔐', name: 'Lock and Key', desc: 'Restore your save from a backup.', event: true, tier: 'small' },

  // --- the creativist: judged on WHICH cells you fill, and in what order ----------------------------------------
  // The shape and order rules live in shapes.js (pure, tested). Shapes sit in the
  // middle 60% of the picture: fill (nearly) only those cells, and nothing else.
  { id: 'shape-heart', icon: '💖', name: 'Lovestruck', desc: 'Fill a heart in the middle of the picture, and only the heart.', event: true, tier: 'big' },
  { id: 'shape-disc', icon: '🎯', name: 'Bullseye', desc: 'Fill a solid circle in the middle, and only the circle.', event: true, tier: 'mid' },
  { id: 'shape-ring', icon: '😇', name: 'Halo', desc: 'Fill a ring in the middle, and only the ring.', event: true, tier: 'mid' },
  { id: 'shape-diamond', icon: '💎', name: 'Diamonds Are Forever', desc: 'Fill a diamond in the middle, and only the diamond.', event: true, tier: 'mid' },
  { id: 'shape-plus', icon: '➕', name: 'Plus One', desc: 'Fill a plus sign in the middle, and only the plus.', event: true, tier: 'mid' },
  { id: 'shape-triangle', icon: '🔺', name: 'Pointed', desc: 'Fill a triangle in the middle, and only the triangle.', event: true, tier: 'mid' },
  { id: 'shape-star', icon: '⭐', name: 'Wish Upon', desc: 'Fill a five-pointed star in the middle, and only the star.', event: true, tier: 'big' },
  { id: 'shape-moon', icon: '🌙', name: 'Moonlight', desc: 'Fill a crescent moon in the middle, and only the crescent.', event: true, tier: 'mid' },
  { id: 'shape-bolt', icon: '⚡', name: 'Bolt', desc: 'Fill a lightning bolt in the middle, and only the bolt.', event: true, tier: 'mid' },
  { id: 'shape-line', icon: '➖', name: 'Straight and Narrow', desc: 'Fill one clean line of cells straight across the picture, and only that line.', event: true, tier: 'mid' },
  { id: 'order-border', icon: '🖼️', name: 'Borderline', desc: 'Finish a 100+ cell picture after filling every edge cell before any other cell.', event: true, tier: 'mid' },
  { id: 'order-in', icon: '🎯', name: 'Outside In', desc: 'Finish a 100+ cell picture working steadily from the outside toward the middle.', event: true, tier: 'mid' },
  { id: 'order-out', icon: '💫', name: 'Inside Out', desc: 'Finish a 100+ cell picture working steadily from the middle outward.', event: true, tier: 'mid' },
  { id: 'order-sweep', icon: '➡️', name: 'Sweep', desc: 'Finish a 100+ cell picture working steadily from left to right.', event: true, tier: 'mid' },
  { id: 'order-curtain', icon: '⬇️', name: 'Curtain', desc: 'Finish a 100+ cell picture working steadily from top to bottom.', event: true, tier: 'mid' },
  { id: 'order-small', icon: '🔍', name: 'Tiniest First', desc: 'Finish a 100+ cell picture after filling its 20 smallest cells first.', event: true, tier: 'mid' },
  { id: 'order-big', icon: '🐘', name: 'Giants First', desc: 'Finish a 100+ cell picture after filling its 20 biggest cells first.', event: true, tier: 'mid' },
  { id: 'order-colour', icon: '🧺', name: 'One at a Time', desc: 'Finish a picture painting each colour completely before starting the next.', event: true, tier: 'mid' },
  { id: 'order-half', icon: '🌗', name: 'Half and Half', desc: 'Finish a 100+ cell picture after filling the whole left half before any of the right.', event: true, tier: 'mid' },
  { id: 'last-cell', icon: '🧍', name: 'Last Cell Standing', desc: 'Leave one cell unpainted for 10 minutes, then finish the picture.', event: true, tier: 'big', hidden: true },

  // --- the finale -------------------------------------------------------------
  { id: 'completionist', share: true, icon: '💯', name: 'Completionist', desc: 'Unlock every other achievement.', event: true, hint: 20 },
];

// Points paid by tier for the second wave (25 / 150 / 500). These entries pay no
// hints (hint: 0, so game.js's `def.hint ?? 1` grants nothing). A `big` entry is
// also a Shareable Award; the original five carry an explicit `share: true`.
export const TIER_POINTS = { small: 25, mid: 150, big: 500 };

for (const a of ACHIEVEMENTS) {
  if (!a.tier) continue;
  a.points = TIER_POINTS[a.tier];
  a.hint = 0;
  if (a.tier === 'big') a.share = true;
}

/** The achievements that can be posted as a Shareable Award card. */
export const SHAREABLE = ACHIEVEMENTS.filter((a) => a.share);

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export class Achievements {
  constructor(unlocked = []) {
    this.unlocked = new Set(unlocked);
    this.listeners = [];
  }

  onUnlock(fn) {
    this.listeners.push(fn);
  }

  has(id) {
    return this.unlocked.has(id);
  }

  #fire(def) {
    this.unlocked.add(def.id);
    for (const fn of this.listeners) fn(def);
  }

  /** Unlocks an event-driven achievement. No-op if already earned. */
  award(id) {
    const def = BY_ID.get(id);
    if (!def || this.unlocked.has(id)) return false;
    this.#fire(def);
    return true;
  }

  /** Re-evaluates every counter achievement. Cheap enough to call per click. */
  sync(stats) {
    for (const def of ACHIEVEMENTS) {
      if (def.id === 'completionist' || !def.track || this.unlocked.has(def.id)) continue;
      if ((stats[def.track] ?? 0) >= def.goal) this.#fire(def);
    }
    // The one achievement with no counter of its own: everything else unlocked.
    if (!this.unlocked.has('completionist') && this.unlocked.size === ACHIEVEMENTS.length - 1) {
      this.#fire(BY_ID.get('completionist'));
    }
  }

  /** Sorted for display: unearned-and-closest first, then earned. */
  list(stats) {
    return ACHIEVEMENTS.map((def) => {
      const earned = this.unlocked.has(def.id);
      const value = def.track ? (stats[def.track] ?? 0) : 0;
      const progress = def.track ? Math.min(1, value / def.goal) : earned ? 1 : 0;
      return { ...def, earned, value, progress };
    }).sort((a, b) => {
      if (a.earned !== b.earned) return a.earned ? 1 : -1;
      return b.progress - a.progress;
    });
  }
}

/**
 * Tracks the streaks and timing windows the event achievements care about, so
 * game.js does not have to carry that bookkeeping itself.
 */
export class StreakTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.combo = 0;
    this.recent = [];
    this.wrongClicks = 0;
  }

  /** @returns {string[]} achievement ids earned by this fill */
  fill(now) {
    this.combo++;
    this.recent.push(now);
    while (this.recent.length && now - this.recent[0] > 10000) this.recent.shift();

    const earned = [];
    if (this.combo >= 15) earned.push('combo-15');
    if (this.combo >= 40) earned.push('combo-40');
    if (this.combo >= 80) earned.push('combo-80');
    if (this.recent.length >= 10) earned.push('rapid-10');
    if (this.recent.length >= 20) earned.push('rapid-20');

    const hour = new Date(now).getHours();
    if (hour >= 2 && hour < 5) earned.push('night-owl');
    if (hour >= 5 && hour < 7) earned.push('early-bird');
    return earned;
  }

  // Switching tubs deliberately is normal play and must not break the streak —
  // only a wrong-colour click does. Auto-advance between tubs would otherwise
  // make these unreachable on any multi-colour picture.
  wrong() {
    this.wrongClicks++;
    this.combo = 0;
  }
}
