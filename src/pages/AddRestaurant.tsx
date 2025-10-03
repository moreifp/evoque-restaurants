import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, ArrowLeft, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function AddRestaurant() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    restaurant_name: "",
    visit_date: "",
    location_address: "",
    rating: 0,
    companions: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("restaurant_entries").insert({
        ...formData,
        user_id: user.id,
        rating: formData.rating || null,
      });

      if (error) throw error;

      toast({
        title: "Restaurant added!",
        description: "Your memory has been saved",
      });

      navigate("/dining");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const setRating = (rating: number) => {
    setFormData((prev) => ({ ...prev, rating }));
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pb-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center space-x-4 mb-8">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl font-bold">Add Restaurant Experience</h1>
          </div>

          {/* Form */}
          <Card>
            <CardHeader>
              <CardTitle>Restaurant Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Restaurant Name */}
                <div className="space-y-2">
                  <Label htmlFor="restaurant_name">Restaurant Name *</Label>
                  <Input
                    id="restaurant_name"
                    type="text"
                    placeholder="La Piazza"
                    value={formData.restaurant_name}
                    onChange={(e) =>
                      setFormData({ ...formData, restaurant_name: e.target.value })
                    }
                    required
                  />
                </div>

                {/* Visit Date */}
                <div className="space-y-2">
                  <Label htmlFor="visit_date">Visit Date *</Label>
                  <Input
                    id="visit_date"
                    type="date"
                    value={formData.visit_date}
                    onChange={(e) =>
                      setFormData({ ...formData, visit_date: e.target.value })
                    }
                    required
                  />
                </div>

                {/* Location */}
                <div className="space-y-2">
                  <Label htmlFor="location_address">Location</Label>
                  <Input
                    id="location_address"
                    type="text"
                    placeholder="Via Roma 123, Florence, Italy"
                    value={formData.location_address}
                    onChange={(e) =>
                      setFormData({ ...formData, location_address: e.target.value })
                    }
                  />
                </div>

                {/* Rating */}
                <div className="space-y-2">
                  <Label>Rating</Label>
                  <div className="flex items-center space-x-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="transition-transform hover:scale-110"
                      >
                        <Star
                          className={cn(
                            "h-8 w-8 transition-colors",
                            star <= formData.rating
                              ? "text-accent fill-accent"
                              : "text-muted-foreground"
                          )}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Companions */}
                <div className="space-y-2">
                  <Label htmlFor="companions">Who were you with?</Label>
                  <Input
                    id="companions"
                    type="text"
                    placeholder="Friends, Family, Solo..."
                    value={formData.companions}
                    onChange={(e) =>
                      setFormData({ ...formData, companions: e.target.value })
                    }
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Share your thoughts, favorite dishes, ambience..."
                    rows={5}
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                  />
                </div>

                {/* Submit */}
                <div className="flex items-center space-x-4">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="flex-1"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {loading ? "Saving..." : "Save Restaurant"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(-1)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
