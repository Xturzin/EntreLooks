from collections import Counter

def analyze_wardrobe(clothes: list) -> dict:
   if not clothes:
      return {
         "total":          0,
         "dominant_colors": [],
         "top_styles":      [],
         "top_types":       [],
         "top_occasions":   []
      }

   def top_items(field, limit=4):
      values  = [c.get(field) for c in clothes if c.get(field)]
      counter = Counter(values)
      total   = len(values) or 1
      return [
         {
            "name":       name,
            "count":      count,
            "percentage": round((count / total) * 100)
         }
         for name, count in counter.most_common(limit)
      ]

   return {
      "total":           len(clothes),
      "dominant_colors": top_items("color"),
      "top_styles":      top_items("style"),
      "top_types":       top_items("type"),
      "top_occasions":   top_items("occasion")
   }