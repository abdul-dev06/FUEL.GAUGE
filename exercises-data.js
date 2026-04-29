'use strict';

/* Cal/min formula: (MET × weightKg × 3.5) / 200 */
const EXERCISE_DATA = {

  strength: [
    {
      group: 'Chest',
      exercises: [
        {
          id: 'bench-press', name: 'Bench Press', met: 5.0,
          muscles: ['Pectorals', 'Front Deltoids', 'Triceps'],
          overview: 'A compound horizontal push performed lying on a bench. The barbell or dumbbells are lowered to mid-chest and pressed back up — one of the most effective upper-body mass builders.',
          mistakes: [
            'Elbows flared to 90° — tuck them to 45–75° to protect the shoulder joint.',
            'Bouncing the bar off the chest — control the descent; the eccentric builds strength.',
            'Losing scapular retraction mid-set — keep shoulder blades pinched throughout.',
          ],
        },
        {
          id: 'incline-db-press', name: 'Incline Dumbbell Press', met: 4.8,
          muscles: ['Upper Pectorals', 'Front Deltoids', 'Triceps'],
          overview: 'Performed on a 30–45° incline bench with dumbbells. The angle shifts emphasis toward the upper (clavicular) pec head and demands more front-delt stabilisation.',
          mistakes: [
            'Bench angle above 45° — load shifts to shoulders, reducing chest work.',
            'Dumbbells drifting too wide at the bottom — limits range and stresses the shoulder.',
          ],
        },
        {
          id: 'push-up', name: 'Push-Up', met: 3.8,
          muscles: ['Pectorals', 'Triceps', 'Front Deltoids', 'Core'],
          overview: 'A bodyweight push with near-infinite progressions. A rigid plank is maintained from head to heel as the chest lowers to the floor and the arms drive back to full extension.',
          mistakes: [
            'Hips sagging or piking — brace abs and glutes to keep the body in a straight line.',
            'Partial range of motion — chest should nearly touch the floor each rep.',
          ],
        },
        {
          id: 'cable-fly', name: 'Cable Fly', met: 4.0,
          muscles: ['Pectorals', 'Front Deltoids'],
          overview: 'An isolation movement using cables at high, mid, or low anchor points to target different chest regions. Cables maintain tension throughout the entire range of motion.',
          mistakes: [
            'Turning it into a press by using too much weight — lead with the elbows, not the hands.',
            'Straight arms — keep a soft elbow throughout to protect the bicep tendon.',
          ],
        },
        {
          id: 'chest-dips', name: 'Dips (Chest)', met: 5.5,
          muscles: ['Lower Pectorals', 'Triceps', 'Front Deltoids'],
          overview: 'Performed on parallel bars with a 30–45° forward torso lean to emphasise the chest over the triceps. The body descends until the upper arm is parallel to the floor.',
          mistakes: [
            'Staying too upright — lean forward to shift load from triceps to chest.',
            'Bouncing out of the bottom — control the descent to protect the shoulder.',
          ],
        },
      ],
    },
    {
      group: 'Back',
      exercises: [
        {
          id: 'pull-up', name: 'Pull-Up', met: 6.0,
          muscles: ['Latissimus Dorsi', 'Biceps', 'Rear Deltoids', 'Core'],
          overview: 'A compound vertical pull lifting the body until the chin clears the bar using a pronated (overhand) grip. One of the best movements for back width and raw pulling strength.',
          mistakes: [
            'Kipping or swinging — strict form actually builds strength; save kipping for CrossFit.',
            'Not achieving a full dead hang — start every rep from a complete arm extension.',
            'Shrugging at the top — think "pull shoulder blades into back pockets."',
          ],
        },
        {
          id: 'barbell-row', name: 'Barbell Row', met: 5.5,
          muscles: ['Latissimus Dorsi', 'Rhomboids', 'Rear Deltoids', 'Biceps'],
          overview: 'A heavy compound horizontal pull with the torso hinged roughly parallel to the floor. Essential for back thickness and overall pulling strength.',
          mistakes: [
            'Using momentum to jerk the weight — control the eccentric for real muscle growth.',
            'Rounding the lower back — brace the core hard and maintain a neutral spine.',
            'Elbows flaring wide — tuck them slightly for better lat engagement.',
          ],
        },
        {
          id: 'lat-pulldown', name: 'Lat Pulldown', met: 5.0,
          muscles: ['Latissimus Dorsi', 'Biceps', 'Rear Deltoids'],
          overview: 'A machine vertical pull ideal for building toward pull-ups or for high-volume lat work. Grip just outside shoulder-width and pull the bar to the upper chest.',
          mistakes: [
            'Pulling behind the neck — increases cervical spine risk with no added benefit.',
            'Leaning back excessively to turn it into a row.',
            'Not letting arms fully extend at the top — denies the lats a full stretch.',
          ],
        },
        {
          id: 'seated-cable-row', name: 'Seated Cable Row', met: 5.0,
          muscles: ['Rhomboids', 'Mid-Traps', 'Latissimus Dorsi', 'Biceps'],
          overview: 'A horizontal cable pull targeting mid-back thickness. The chest pad (or a braced posture) provides stability for heavy loads.',
          mistakes: [
            'Rocking the torso to create momentum — keep the upper body stationary.',
            'Not squeezing the shoulder blades together at end of pull.',
          ],
        },
        {
          id: 'face-pull', name: 'Face Pull', met: 3.8,
          muscles: ['Rear Deltoids', 'Rotator Cuff', 'Mid-Traps'],
          overview: 'A rope cable exercise pulled to the forehead with elbows flared high. Critical for shoulder health and posture, countering the internal rotation caused by heavy pressing.',
          mistakes: [
            'Weight too heavy — this is a corrective exercise; use high reps (15–25) with light load.',
            'Pulling to the neck or chest instead of the forehead.',
          ],
        },
      ],
    },
    {
      group: 'Shoulders',
      exercises: [
        {
          id: 'overhead-press', name: 'Overhead Press', met: 5.0,
          muscles: ['Front Deltoids', 'Lateral Deltoids', 'Triceps', 'Traps'],
          overview: 'Standing or seated, the bar or dumbbells are pressed from shoulder height to full lockout overhead. The primary measure of upper-body pressing strength.',
          mistakes: [
            'Excessive lower-back arch — brace the core and squeeze glutes to stay neutral.',
            'Bar path going forward instead of straight up — press around the face in a slight arc.',
            'Not locking out fully — lockout is the point of maximum shoulder contraction.',
          ],
        },
        {
          id: 'lateral-raise', name: 'Lateral Raise', met: 3.5,
          muscles: ['Lateral Deltoids'],
          overview: 'An isolation exercise for the side delt — the muscle most responsible for shoulder width. Dumbbells or cables are raised to shoulder height with slightly bent elbows.',
          mistakes: [
            'Swinging to generate momentum — strict form with controlled reps builds the muscle.',
            'Raising above parallel — going past 90° shifts load to traps.',
            'Shrugging — keep shoulders depressed throughout.',
            'Thumbs pointing up — slight external rotation (pinky up) isolates the lateral delt better.',
          ],
        },
        {
          id: 'arnold-press', name: 'Arnold Press', met: 4.5,
          muscles: ['All Deltoid Heads', 'Triceps'],
          overview: 'Starts like the top of a curl (palms facing in) and rotates outward to a standard press at the top. Invented by Arnold Schwarzenegger to hit all three delt heads in one movement.',
          mistakes: [
            'Rushing the rotation — the pronation/supination is where the benefit lives.',
            'Too much weight — the rotational component limits how much can be pressed safely.',
          ],
        },
        {
          id: 'rear-delt-fly', name: 'Rear Delt Fly', met: 3.5,
          muscles: ['Rear Deltoids', 'Rhomboids', 'Mid-Traps'],
          overview: 'An isolation exercise for the posterior deltoid performed bent-over or on a machine. Essential for balanced shoulder development and healthy posture.',
          mistakes: [
            'Too much weight — rear delts are small; use light load with high reps (15–25).',
            'Pulling elbows too far back, turning it into a row — stop when arms are perpendicular to the torso.',
          ],
        },
        {
          id: 'front-raise', name: 'Front Raise', met: 3.5,
          muscles: ['Front Deltoids'],
          overview: 'An isolation movement raising weight directly in front of the body to shoulder height. Often unnecessary if pressing volume is high, as front delts are heavily recruited in all push movements.',
          mistakes: [
            'Going above shoulder height — no added benefit, increased injury risk.',
            'Using momentum — pause one second at the top.',
          ],
        },
      ],
    },
    {
      group: 'Biceps',
      exercises: [
        {
          id: 'barbell-curl', name: 'Barbell Curl', met: 3.8,
          muscles: ['Biceps Brachii', 'Brachialis'],
          overview: 'The classic bicep exercise. A barbell or EZ-bar is curled from full extension to full contraction at the shoulder, with upper arms pinned to the sides throughout.',
          mistakes: [
            'Swinging the torso — keep upper arms stationary and the movement strict.',
            'Not achieving full extension at the bottom — you lose the best part of the stretch.',
            'Gripping too tightly — a relaxed forearm keeps tension on the bicep.',
          ],
        },
        {
          id: 'hammer-curl', name: 'Hammer Curl', met: 3.8,
          muscles: ['Brachialis', 'Brachioradialis', 'Biceps Brachii'],
          overview: 'A neutral-grip curl (thumbs up) targeting the brachialis — the muscle beneath the bicep that, when developed, pushes the bicep up and increases overall arm width.',
          mistakes: [
            'Rotating the wrist mid-rep — keep the neutral grip from start to finish.',
          ],
        },
        {
          id: 'incline-db-curl', name: 'Incline Dumbbell Curl', met: 3.5,
          muscles: ['Biceps Brachii (Long Head)'],
          overview: 'Performed on a 45–60° incline bench with arms hanging behind the body. Creates maximum stretch on the long head of the bicep — a unique loading position no other curl replicates.',
          mistakes: [
            'Bench angle too steep (over 60°) — reduces the long-head stretch benefit.',
            'Elbows drifting forward — keep upper arms perpendicular to the floor.',
          ],
        },
        {
          id: 'preacher-curl', name: 'Preacher Curl', met: 3.5,
          muscles: ['Biceps Brachii (Short Head)', 'Brachialis'],
          overview: 'A preacher bench braces the upper arms, eliminating any possibility of cheating. Emphasises the short head and the bottom portion of the range of motion.',
          mistakes: [
            'Dropping the weight fast at the bottom — the eccentric is where growth happens.',
            'Not fully extending at the bottom — this is the best part of the exercise.',
          ],
        },
        {
          id: 'cable-curl', name: 'Cable Curl', met: 3.5,
          muscles: ['Biceps Brachii', 'Brachialis'],
          overview: 'A cable-based curl that maintains constant tension throughout the full range of motion — unlike free weights which have a "dead" point at full extension.',
          mistakes: [
            'Pulling with the shoulders — keep the upper arms stationary.',
            'Short range of motion — extend fully to straight at the bottom.',
          ],
        },
      ],
    },
    {
      group: 'Triceps',
      exercises: [
        {
          id: 'tricep-pushdown', name: 'Tricep Pushdown', met: 4.0,
          muscles: ['Triceps (All Heads)'],
          overview: 'A cable machine exercise pressing a bar or rope downward to full elbow extension. The most common tricep isolation movement and a reliable finisher after compound pushing.',
          mistakes: [
            'Elbows drifting away from the body — pin them tight to your sides.',
            'Leaning too far forward and using body weight to push.',
            'Not locking out — full extension is the point of maximum tricep contraction.',
          ],
        },
        {
          id: 'skull-crusher', name: 'Skull Crusher', met: 4.5,
          muscles: ['Triceps (Long Head)'],
          overview: 'A lying EZ-bar or dumbbell extension lowered toward the forehead (or behind the head for more long-head stretch). One of the best mass-building tricep movements.',
          mistakes: [
            'Elbows flaring out — keep them pointing straight at the ceiling.',
            'Lowering to the face rather than the crown — going past the head increases long-head stretch.',
          ],
        },
        {
          id: 'close-grip-bench', name: 'Close-Grip Bench Press', met: 5.0,
          muscles: ['Triceps', 'Front Deltoids', 'Pectorals'],
          overview: 'A barbell bench press with hands at shoulder-width, shifting primary load from the chest to the triceps. The safest way to overload the triceps with heavy weight.',
          mistakes: [
            'Grip too narrow (thumbs nearly touching) — causes wrist strain; use shoulder-width.',
            'Elbows flaring — tuck them to keep triceps as the primary mover.',
          ],
        },
        {
          id: 'overhead-tricep-ext', name: 'Overhead Tricep Extension', met: 4.0,
          muscles: ['Triceps (Long Head)'],
          overview: 'A dumbbell or cable extension performed with arms overhead, placing the long head of the tricep under a stretch. Essential for targeting the long head, which makes up over two-thirds of tricep mass.',
          mistakes: [
            'Elbows spreading wide — keep them pointing straight up, close to the ears.',
            'Arching the lower back — brace the core, especially on the seated variation.',
          ],
        },
        {
          id: 'tricep-dips', name: 'Dips (Triceps)', met: 5.0,
          muscles: ['Triceps', 'Front Deltoids', 'Lower Pectorals'],
          overview: 'Same as chest dips but performed with an upright torso to shift load to the triceps. Can be done on parallel bars or a bench.',
          mistakes: [
            'Leaning forward — stay upright for tricep focus.',
            'Violent lockout — control the top of the movement.',
          ],
        },
      ],
    },
    {
      group: 'Quads',
      exercises: [
        {
          id: 'back-squat', name: 'Back Squat', met: 7.0,
          muscles: ['Quadriceps', 'Glutes', 'Hamstrings', 'Core', 'Adductors'],
          overview: 'The foundational lower-body exercise. A barbell rests on the traps while the athlete descends until the hip crease breaks below knee level, then drives back up.',
          mistakes: [
            'Knees caving inward (valgus) — push knees out in the direction of the little toe.',
            'Not reaching depth — hip crease should break below the knee.',
            'Forward lean from tight ankles — improve ankle mobility or elevate heels slightly.',
          ],
        },
        {
          id: 'leg-press', name: 'Leg Press', met: 6.0,
          muscles: ['Quadriceps', 'Glutes', 'Hamstrings'],
          overview: 'A machine-based push allowing high volume without the balance demands of a squat. Foot placement changes the emphasis significantly.',
          mistakes: [
            'Locking out knees at the top — keep a slight bend to protect the joint.',
            'Lifting hips off the pad at the bottom — reduce range if this happens.',
          ],
        },
        {
          id: 'leg-extension', name: 'Leg Extension', met: 4.5,
          muscles: ['Quadriceps (Rectus Femoris)'],
          overview: 'A machine isolation movement best used as a finisher after compound quad work. The knee extends from ~90° to full lockout.',
          mistakes: [
            'Jerking the weight up — slow, controlled reps with a peak squeeze are far more effective.',
            'Not reaching full extension — lockout is the maximum contraction point.',
          ],
        },
        {
          id: 'bulgarian-split-squat', name: 'Bulgarian Split Squat', met: 6.5,
          muscles: ['Quadriceps', 'Glutes', 'Hamstrings', 'Hip Flexors'],
          overview: 'A rear-foot elevated split squat where the back foot rests on a bench. Creates high unilateral quad and glute tension while exposing side-to-side strength imbalances.',
          mistakes: [
            'Rear foot too close to the bench — back knee should nearly touch the ground at the bottom.',
            'Excessive forward lean — creates hip flexor work over quad work.',
            'Front knee caving inward — push it out throughout.',
          ],
        },
        {
          id: 'hack-squat', name: 'Hack Squat', met: 6.5,
          muscles: ['Quadriceps', 'Glutes'],
          overview: 'A machine squat on a fixed track with the body inclined. Allows heavy quad loading with less spinal compression than a barbell squat.',
          mistakes: [
            'Knees tracking inward — keep them aligned with the toes.',
            'Heels lifting off the platform mid-rep.',
          ],
        },
      ],
    },
    {
      group: 'Hamstrings',
      exercises: [
        {
          id: 'romanian-deadlift', name: 'Romanian Deadlift', met: 6.0,
          muscles: ['Hamstrings', 'Glutes', 'Erector Spinae'],
          overview: 'A hip-hinge movement where the bar descends along the legs while the hips push back. The knees remain slightly bent throughout, keeping tension on the hamstrings the entire way down.',
          mistakes: [
            'Rounding the lower back — maintain a neutral spine or a slight arch throughout.',
            'Bending the knees too much — this turns it into a deadlift, not an RDL.',
            'Not pushing hips back far enough — the hip hinge drives the hamstring stretch.',
          ],
        },
        {
          id: 'lying-leg-curl', name: 'Lying Leg Curl', met: 4.0,
          muscles: ['Hamstrings', 'Gastrocnemius'],
          overview: 'A machine isolation exercise performed prone (face down). The pad is curled toward the glutes, isolating the hamstrings through pure knee flexion.',
          mistakes: [
            'Hips lifting off the pad — anchor the hips; only the lower legs should move.',
            'Not controlling the eccentric — slow lowering (3–4 s) is where growth happens.',
          ],
        },
        {
          id: 'nordic-curl', name: 'Nordic Curl', met: 5.5,
          muscles: ['Hamstrings (Eccentric)'],
          overview: 'Ankles are anchored and the body falls forward from kneeling, controlled by the hamstrings. Exceptional eccentric strength builder and one of the best injury-prevention exercises for athletes.',
          mistakes: [
            'Going too fast before building eccentric strength — use a band for assistance at first.',
            'Arching the lower back — maintain a straight torso-to-thigh alignment.',
          ],
        },
        {
          id: 'stiff-leg-deadlift', name: 'Stiff-Leg Deadlift', met: 5.5,
          muscles: ['Hamstrings', 'Glutes', 'Erector Spinae'],
          overview: 'Similar to the RDL but starts from the floor with a full reset each rep. Knees remain near-straight throughout, creating a large hamstring stretch on every repetition.',
          mistakes: [
            'Locking knees completely — keep a very slight bend to avoid hyperextension.',
            'Rounding the thoracic spine — keep chest up and proud.',
          ],
        },
        {
          id: 'glute-ham-raise', name: 'Glute-Ham Raise', met: 6.0,
          muscles: ['Hamstrings', 'Glutes', 'Calves'],
          overview: 'A machine exercise training the hamstrings through both knee flexion and hip extension simultaneously. One of the most complete posterior chain movements available in a gym.',
          mistakes: [
            'Using momentum to rise — hamstrings and glutes must do all the work.',
            'Descending too deep beyond flexibility — only go as low as hamstring mobility allows.',
          ],
        },
      ],
    },
    {
      group: 'Glutes',
      exercises: [
        {
          id: 'hip-thrust', name: 'Hip Thrust', met: 6.0,
          muscles: ['Glutes', 'Hamstrings', 'Hip Flexors'],
          overview: 'Upper back rests on a bench with a barbell across the hips. The hips are driven upward to full extension, making it the most direct heavy-loading glute exercise available.',
          mistakes: [
            'Not reaching full hip extension at the top — squeeze and hold for 1 second.',
            'Lower back arching at the top — ribs should stay down, not flare up.',
            'Feet too close — find the position where glutes feel hardest contracted at the top.',
          ],
        },
        {
          id: 'glute-bridge', name: 'Glute Bridge', met: 4.0,
          muscles: ['Glutes', 'Hamstrings'],
          overview: 'A floor version of the hip thrust performed without a bench. Lower loading ceiling but excellent for beginners or as an activation drill before heavier work.',
          mistakes: [
            'Not pausing at the top — hold for 2 seconds with a glute squeeze.',
            'Driving through the toes — drive through heels to maximise glute recruitment.',
          ],
        },
        {
          id: 'cable-kickback', name: 'Cable Kickback', met: 3.5,
          muscles: ['Gluteus Maximus'],
          overview: 'A cable isolation exercise where the ankle attachment is driven back and up, contracting the glute at the top. Targets the glute in isolation in a way compound movements cannot replicate.',
          mistakes: [
            'Hip swinging — the motion must come from the glute, not momentum.',
            'Short range of motion — extend the leg fully to feel the full glute contraction.',
          ],
        },
        {
          id: 'sumo-deadlift', name: 'Sumo Deadlift', met: 7.0,
          muscles: ['Glutes', 'Adductors', 'Hamstrings', 'Quadriceps', 'Erector Spinae'],
          overview: 'A wide-stance deadlift with toes turned out significantly. The reduced range of motion and wide stance places greater demand on the glutes and adductors versus conventional stance.',
          mistakes: [
            'Knees caving inward — push them out over the toes throughout the lift.',
            'Hips rising before the bar — drive the floor away; hips and shoulders rise together.',
          ],
        },
        {
          id: 'step-up', name: 'Step-Up', met: 5.0,
          muscles: ['Glutes', 'Quadriceps', 'Hamstrings'],
          overview: 'A unilateral exercise stepping onto a box or bench. Each leg works independently, forcing the glutes and quads to fire without the stronger side compensating.',
          mistakes: [
            'Pushing off the trailing leg — the working leg should do all the lifting.',
            'Box too low — aim for a height where the working knee is at 90° at the start.',
          ],
        },
      ],
    },
    {
      group: 'Core',
      exercises: [
        {
          id: 'plank', name: 'Plank', met: 3.8,
          muscles: ['Transverse Abdominis', 'Rectus Abdominis', 'Obliques', 'Glutes'],
          overview: 'An isometric hold in a forearm or push-up position. Trains the core\'s primary function: resisting extension of the spine under load. The foundation of all core training.',
          mistakes: [
            'Hips sagging — squeeze glutes and brace the abs hard.',
            'Hips piked upward — the body must form a perfectly straight line.',
            'Holding breath — brace while breathing steadily.',
          ],
        },
        {
          id: 'hanging-leg-raise', name: 'Hanging Leg Raise', met: 4.0,
          muscles: ['Rectus Abdominis (Lower)', 'Hip Flexors', 'Obliques'],
          overview: 'Hanging from a bar, the legs are raised to 90° or higher. One of the most effective exercises for the lower abdominal region when done with a posterior pelvic tilt at the top.',
          mistakes: [
            'Swinging — control the descent back to the dead hang.',
            'Only lifting the legs — curl the pelvis toward the ribs at the top to actually engage the abs.',
          ],
        },
        {
          id: 'ab-wheel', name: 'Ab Wheel Rollout', met: 4.5,
          muscles: ['Transverse Abdominis', 'Rectus Abdominis', 'Latissimus Dorsi'],
          overview: 'An ab wheel is rolled forward from kneeling (or standing, advanced) while maintaining a rigid torso, then pulled back. One of the most demanding and effective anti-extension core exercises.',
          mistakes: [
            'Hips sagging as you roll out — maintain a posterior pelvic tilt.',
            'Rolling too far before building sufficient strength — start with half-rollouts.',
          ],
        },
        {
          id: 'russian-twist', name: 'Russian Twist', met: 3.8,
          muscles: ['Obliques', 'Rectus Abdominis'],
          overview: 'Seated at ~45° to the floor, the torso rotates side to side holding a plate, medicine ball, or dumbbell. Targets the obliques through rotational resistance.',
          mistakes: [
            'Feet on the floor — elevating feet dramatically increases core demand.',
            'Rotating at the hips rather than the ribcage — the movement must come from the thoracic spine.',
          ],
        },
        {
          id: 'cable-crunch', name: 'Cable Crunch', met: 3.8,
          muscles: ['Rectus Abdominis', 'Obliques'],
          overview: 'A kneeling crunch with a rope cable attachment that allows progressive overload on the abs with real weight — unlike floor crunches which plateau quickly.',
          mistakes: [
            'Pulling with the arms — the motion comes from rounding the spine, not arm movement.',
            'Hinging at the hips instead of rounding the lumbar spine — the lower back must flex for the abs to contract.',
          ],
        },
      ],
    },
    {
      group: 'Forearms',
      exercises: [
        {
          id: 'wrist-curl', name: 'Wrist Curl', met: 3.0,
          muscles: ['Flexor Carpi Radialis', 'Flexor Carpi Ulnaris'],
          overview: 'Forearms resting on thighs or a bench, a barbell or dumbbells are curled using only the wrists. Directly trains the wrist flexors for forearm size and grip endurance.',
          mistakes: [
            'Short range — let the weight roll to the fingertips at the bottom for a full stretch.',
            'Lifting the forearms off the support — keep them pinned flat.',
          ],
        },
        {
          id: 'reverse-curl', name: 'Reverse Curl', met: 3.5,
          muscles: ['Brachioradialis', 'Wrist Extensors', 'Biceps'],
          overview: 'A curl performed with a pronated (overhand) grip targeting the brachioradialis and wrist extensors. Corrects the flexor/extensor imbalance that develops from standard curls alone.',
          mistakes: [
            'Wrists breaking downward — keep them neutral or slightly extended throughout.',
            'Too much weight and momentum — keep reps strict.',
          ],
        },
        {
          id: 'farmers-carry', name: "Farmer's Carry", met: 5.0,
          muscles: ['Grip', 'Traps', 'Core', 'Legs'],
          overview: 'Heavy dumbbells or a trap bar are carried for distance or time. A full-body functional exercise with exceptional carry-over to grip strength, traps, and overall stability.',
          mistakes: [
            'Weight too light — it should be a genuine, uncomfortable challenge.',
            'Short, shuffled steps — walk with a normal stride.',
          ],
        },
        {
          id: 'dead-hang', name: 'Dead Hang', met: 3.5,
          muscles: ['Grip', 'Latissimus Dorsi', 'Shoulder Girdle'],
          overview: 'Simply hanging from a pull-up bar in a fully relaxed dead hang. Builds passive grip strength, decompresses the spine, and improves shoulder mobility.',
          mistakes: [
            'Actively engaging the lats — a true dead hang is fully passive and relaxed.',
            'Holding breath — breathe normally; this is a timed endurance hold.',
          ],
        },
        {
          id: 'plate-pinch', name: 'Plate Pinch', met: 3.0,
          muscles: ['Finger Flexors', 'Thumb Muscles'],
          overview: 'One or two weight plates are pinched together between the thumb and fingers and held for time or carried for distance. Develops specific fingertip and pinch grip strength.',
          mistakes: [
            'Curling the wrist to compensate — fingers do all the work.',
          ],
        },
      ],
    },
  ],

  cardio: [
    {
      machine: 'Treadmill',
      activities: [
        { id: 'treadmill-walk',     name: 'Walking',          met: 3.5,  desc: 'Casual pace ~3 mph — great for active recovery and steady low-intensity burn.' },
        { id: 'treadmill-brisk',    name: 'Brisk Walk',       met: 4.5,  desc: 'Fast walk ~4 mph — elevates heart rate without running impact.' },
        { id: 'treadmill-incline',  name: 'Incline Walk',     met: 6.0,  desc: '10–15% grade at 3 mph — mimics hiking; high glute demand and calorie load.' },
        { id: 'treadmill-jog',      name: 'Jogging',          met: 8.3,  desc: 'Easy jog ~5 mph — sustainable aerobic zone for most fitness levels.' },
        { id: 'treadmill-run',      name: 'Running',          met: 11.5, desc: 'Sustained run ~7 mph — pushes aerobic capacity with high calorie output.' },
        { id: 'treadmill-sprint',   name: 'Sprint Intervals', met: 14.0, desc: 'Max-effort sprints alternating with recovery walks — high intensity, time-efficient.' },
      ],
    },
    {
      machine: 'Elliptical',
      activities: [
        { id: 'elliptical-easy',     name: 'Easy',     met: 4.5,  desc: 'Low resistance, comfortable pace — ideal warm-up or active recovery.' },
        { id: 'elliptical-moderate', name: 'Moderate', met: 6.0,  desc: 'Medium resistance, steady rhythm — classic aerobic zone.' },
        { id: 'elliptical-hard',     name: 'Hard',     met: 8.5,  desc: 'High resistance and cadence — approaches running intensity with lower joint impact.' },
        { id: 'elliptical-hiit',     name: 'HIIT',     met: 10.5, desc: 'Alternating high-resistance sprints with easy recovery intervals.' },
      ],
    },
    {
      machine: 'Stationary Bike',
      activities: [
        { id: 'bike-easy',     name: 'Easy Spin',      met: 3.5,  desc: 'Light load, relaxed pace — recovery ride or gentle warm-up.' },
        { id: 'bike-moderate', name: 'Moderate',        met: 7.0,  desc: 'Moderate resistance at a steady cadence — solid aerobic training.' },
        { id: 'bike-intense',  name: 'Intense',         met: 10.5, desc: 'High resistance sustained effort — equivalent to a hard outdoor ride.' },
        { id: 'bike-hiit',     name: 'HIIT Intervals',  met: 14.0, desc: 'All-out sprint intervals (20–40 s) with rest periods — highest intensity output.' },
      ],
    },
    {
      machine: 'Rowing Machine',
      activities: [
        { id: 'row-easy',      name: 'Easy Row',    met: 4.8,  desc: 'Light stroke, ~18–20 spm — recovery focus; technique and full-body warm-up.' },
        { id: 'row-moderate',  name: 'Moderate',    met: 7.0,  desc: 'Steady effort at ~22–24 spm — full aerobic development across the whole body.' },
        { id: 'row-intervals', name: 'Intervals',   met: 9.8,  desc: '500 m hard / 500 m easy alternating — excellent for cardiovascular conditioning.' },
        { id: 'row-race',      name: 'Race Pace',   met: 12.0, desc: 'Hard sustained effort at 28+ spm — maximum aerobic output for experienced rowers.' },
      ],
    },
    {
      machine: 'Stair Climber',
      activities: [
        { id: 'stairs-slow',     name: 'Slow',     met: 6.0,  desc: 'Deliberate step pace — great for glutes and calves, sustainable over long sessions.' },
        { id: 'stairs-moderate', name: 'Moderate', met: 9.0,  desc: 'Consistent medium pace — one of the highest cal/min among steady-state cardio machines.' },
        { id: 'stairs-fast',     name: 'Fast',     met: 12.0, desc: 'High stepping rate — extremely high intensity, legs will fatigue quickly.' },
      ],
    },
    {
      machine: 'Jump Rope',
      activities: [
        { id: 'jumprope-moderate', name: 'Moderate',       met: 10.0, desc: 'Steady two-foot jumps at a comfortable pace — highly accessible and effective.' },
        { id: 'jumprope-fast',     name: 'Fast',            met: 12.5, desc: 'Quick alternate-foot strikes — high calorie burn, improves coordination.' },
        { id: 'jumprope-double',   name: 'Double Unders',   met: 14.0, desc: 'Rope passes twice per jump — advanced skill with exceptional metabolic demand.' },
      ],
    },
    {
      machine: 'Outdoors',
      activities: [
        { id: 'outdoor-walk',      name: 'Walking',              met: 3.5,  desc: 'Casual outdoor walk — easy on the joints and great for daily step targets.' },
        { id: 'outdoor-brisk',     name: 'Brisk Walk',           met: 4.3,  desc: 'Fast-paced outdoor walk — elevates heart rate without any running impact.' },
        { id: 'outdoor-hike',      name: 'Hiking',               met: 6.0,  desc: 'Trail walking with elevation — significantly higher calorie burn than flat walking.' },
        { id: 'outdoor-run',       name: 'Running',              met: 9.8,  desc: 'Outdoor steady-state run — slightly more demanding than a treadmill due to wind resistance and terrain.' },
        { id: 'outdoor-cycle',     name: 'Cycling (easy)',       met: 4.0,  desc: 'Leisurely outdoor ride — low effort, good for active recovery and commuting.' },
        { id: 'outdoor-cycle-mod', name: 'Cycling (moderate)',   met: 8.0,  desc: 'Moderate-pace road or trail ride — sustained aerobic effort.' },
        { id: 'outdoor-swim',      name: 'Swimming',             met: 8.3,  desc: 'Freestyle laps — full-body cardiovascular effort with zero joint impact.' },
        { id: 'outdoor-climb',     name: 'Rock Climbing',        met: 7.5,  desc: 'Sport or trad climbing — demands grip strength, pulling, and problem-solving under physical stress.' },
      ],
    },
  ],
};
