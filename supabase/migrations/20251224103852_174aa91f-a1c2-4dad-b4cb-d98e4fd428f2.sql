-- Add DELETE policy so users can delete their own profile (GDPR compliance)
CREATE POLICY "Users can delete their own profile" 
ON public.profiles 
FOR DELETE 
USING (auth.uid() = id);