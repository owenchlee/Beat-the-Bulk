/* ============================================================
   BEAT THE BULK — Food data
   Calorie values approximate real-world USDA figures per typical
   serving. Weight gained uses the same 3500 kcal ≈ 1 lb constant
   as the exercise burn math, so eating and exercising trade off
   on one consistent, honest scale.
   ============================================================ */
(function (global) {
  const FOODS = [
    { e: '🍕', n: 'Pizza Slice', cal: 285, healthy: false },
    { e: '🥗', n: 'Side Salad', cal: 45, healthy: true },
    { e: '🍔', n: 'Cheeseburger', cal: 295, healthy: false },
    { e: '🍎', n: 'Apple', cal: 95, healthy: true },
    { e: '🍩', n: 'Donut', cal: 250, healthy: false },
    { e: '🥦', n: 'Broccoli', cal: 55, healthy: true },
    { e: '🍦', n: 'Ice Cream', cal: 207, healthy: false },
    { e: '🍗', n: 'Grilled Chicken', cal: 165, healthy: true },
    { e: '🎂', n: 'Cake Slice', cal: 257, healthy: false },
    { e: '🥕', n: 'Carrots', cal: 41, healthy: true },
    { e: '🍟', n: 'Fries', cal: 312, healthy: false },
    { e: '🫐', n: 'Berries', cal: 57, healthy: true },
    { e: '🥑', n: 'Avocado', cal: 234, healthy: true },
    { e: '🍫', n: 'Chocolate Bar', cal: 210, healthy: false },
    { e: '🍣', n: 'Sushi Roll', cal: 255, healthy: true },
    { e: '🌭', n: 'Hot Dog', cal: 290, healthy: false }
  ];

  const CAL_LIMIT = 700;

  global.BTB = global.BTB || {};
  global.BTB.Foods = FOODS;
  global.BTB.CAL_LIMIT = CAL_LIMIT;
})(window);
