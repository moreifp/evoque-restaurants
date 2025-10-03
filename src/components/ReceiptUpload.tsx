import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, X, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReceiptItem {
  item_type: "dish" | "drink";
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface ReceiptData {
  items: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  service_fee?: number;
  total: number;
  currency: string;
}

interface ReceiptUploadProps {
  entryId?: string;
  onReceiptProcessed?: (data: ReceiptData) => void;
}

export const ReceiptUpload = ({ entryId, onReceiptProcessed }: ReceiptUploadProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    if (!selectedFile.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    setFile(selectedFile);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const removeFile = () => {
    setFile(null);
    setPreview("");
    setReceiptData(null);
  };

  const processReceipt = async () => {
    if (!file) return;

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Upload to storage first
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/receipt-${Date.now()}.${fileExt}`;

      const { error: uploadError, data } = await supabase.storage
        .from("restaurant-photos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("restaurant-photos")
        .getPublicUrl(fileName);

      // Process with AI
      toast({
        title: "Processing receipt...",
        description: "This may take a few seconds",
      });

      const { data: functionData, error: functionError } = await supabase.functions.invoke(
        "process-receipt",
        {
          body: { imageUrl: publicUrl },
        }
      );

      if (functionError) {
        console.error("Function error:", functionError);
        throw new Error(`Processing error: ${functionError.message}`);
      }

      if (!functionData?.success) {
        throw new Error(functionData?.error || "Failed to process receipt");
      }

      const extractedData = functionData.data;
      setReceiptData(extractedData);

      // If we have an entryId, save to database
      if (entryId) {
        const { data: receipt, error: receiptError } = await supabase
          .from("receipts")
          .insert({
            entry_id: entryId,
            photo_url: publicUrl,
            subtotal: extractedData.subtotal,
            tax: extractedData.tax,
            service_fee: extractedData.service_fee,
            total: extractedData.total,
            currency: extractedData.currency,
          })
          .select()
          .single();

        if (receiptError) throw receiptError;

        // Save items
        const itemsToInsert = extractedData.items.map((item: ReceiptItem) => ({
          receipt_id: receipt.id,
          ...item,
        }));

        const { error: itemsError } = await supabase
          .from("receipt_items")
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      toast({
        title: "Receipt processed!",
        description: `Extracted ${extractedData.items.length} items from your receipt`,
      });

      onReceiptProcessed?.(extractedData);
    } catch (error: any) {
      console.error("Error processing receipt:", error);
      
      let errorMessage = error.message;
      if (error.message?.includes("429")) {
        errorMessage = "Rate limit reached. Please wait a moment and try again.";
      } else if (error.message?.includes("402")) {
        errorMessage = "AI credits exhausted. Please add credits to your Lovable workspace.";
      }
      
      toast({
        title: "Processing failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Upload Receipt/Invoice</Label>
        <div className="flex items-center space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => document.getElementById("receipt-upload")?.click()}
            className="flex-1"
          >
            <Upload className="h-4 w-4 mr-2" />
            Select Receipt Image
          </Button>
          <input
            id="receipt-upload"
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          {file && (
            <Button
              type="button"
              onClick={processReceipt}
              disabled={processing}
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Process Receipt
                </>
              )}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Upload a photo of your receipt to automatically extract dishes, drinks, and prices
        </p>
      </div>

      {/* Preview */}
      {preview && (
        <div className="relative rounded-lg overflow-hidden border border-border">
          <img
            src={preview}
            alt="Receipt preview"
            className="w-full max-h-64 object-contain"
          />
          <button
            type="button"
            onClick={removeFile}
            className="absolute top-2 right-2 p-1 bg-background/80 backdrop-blur rounded-full hover:bg-background transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Extracted Data */}
      {receiptData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Extracted Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Items */}
            <div className="space-y-2">
              {receiptData.items.map((item, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-2 rounded bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.item_type} • Qty: {item.quantity}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {receiptData.currency} {item.line_total.toFixed(2)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      @ {item.unit_price.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-t pt-4 space-y-1">
              {receiptData.subtotal && (
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>
                    {receiptData.currency} {receiptData.subtotal.toFixed(2)}
                  </span>
                </div>
              )}
              {receiptData.tax && (
                <div className="flex justify-between text-sm">
                  <span>Tax</span>
                  <span>
                    {receiptData.currency} {receiptData.tax.toFixed(2)}
                  </span>
                </div>
              )}
              {receiptData.service_fee && (
                <div className="flex justify-between text-sm">
                  <span>Service Fee</span>
                  <span>
                    {receiptData.currency} {receiptData.service_fee.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-bold pt-2 border-t">
                <span>Total</span>
                <span>
                  {receiptData.currency} {receiptData.total.toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
