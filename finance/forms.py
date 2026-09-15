from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from .models import UserProfile

class CustomUserCreationForm(UserCreationForm):
    role = forms.ChoiceField(choices=UserProfile.Role.choices, required=True, label="Select Role")

    class Meta(UserCreationForm.Meta):
        model = User
        fields = UserCreationForm.Meta.fields

    def save(self, commit=True):
        user = super().save(commit=False)
        if commit:
            user.save()
            user.userprofile.role = self.cleaned_data['role']
            user.userprofile.save()
        return user
