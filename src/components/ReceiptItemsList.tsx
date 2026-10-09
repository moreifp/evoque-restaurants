import { Badge } from "@/components/ui/badge";
import { Utensils, Wine } from "lucide-react";

interface ReceiptItem {
  id: string;
  item_type: "dish" | "drink";
  name: string;
  name_pt?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface ReceiptItemsListProps {
  items: ReceiptItem[];
}

export function ReceiptItemsList({ items }: ReceiptItemsListProps) {
  if (items.length === 0) {
    return <p className="text-muted-foreground">No items found</p>;
  }

  // Separate dishes and drinks
  const dishes = items.filter((item) => item.item_type === "dish");
  const drinks = items.filter((item) => item.item_type === "drink");

  return (
    <div className="space-y-4">
      {/* Dishes */}
      {dishes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Utensils className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-medium text-sm">Dishes</h4>
            <Badge variant="secondary">{dishes.length}</Badge>
          </div>
          <div className="space-y-2 pl-6">
            {dishes.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-start p-3 rounded-lg bg-muted/50"
              >
                <div className="flex-1">
                  <p className="font-medium">{item.name_pt || item.name}</p>
                  {item.name_pt && item.name_pt !== item.name && (
                    <p className="text-xs text-muted-foreground">{item.name}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Qty: {item.quantity} × {item.unit_price.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{item.line_total.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drinks */}
      {drinks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Wine className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-medium text-sm">Drinks</h4>
            <Badge variant="secondary">{drinks.length}</Badge>
          </div>
          <div className="space-y-2 pl-6">
            {drinks.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-start p-3 rounded-lg bg-muted/50"
              >
                <div className="flex-1">
                  <p className="font-medium">{item.name_pt || item.name}</p>
                  {item.name_pt && item.name_pt !== item.name && (
                    <p className="text-xs text-muted-foreground">{item.name}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Qty: {item.quantity} × {item.unit_price.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{item.line_total.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
