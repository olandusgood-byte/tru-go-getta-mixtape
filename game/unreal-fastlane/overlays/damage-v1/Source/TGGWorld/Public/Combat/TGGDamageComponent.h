#pragma once

#include "Components/ActorComponent.h"
#include "Combat/TGGDamageTypes.h"
#include "Combat/TGGDamagePresentation.h"
#include "TGGDamageComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FTGGDamageValueChanged, float, PreviousValue, float, NewValue);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FTGGDamageApplied, float, HealthDamage, float, ArmorDamage);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FTGGDamageStateEvent);

UCLASS(ClassGroup=(TGG), meta=(BlueprintSpawnableComponent))
class TGGWORLD_API UTGGDamageComponent : public UActorComponent {
  GENERATED_BODY()

public:
  UTGGDamageComponent();

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category="TGG|Damage")
  float MaxHealth = 100.0f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category="TGG|Damage")
  float MaxArmor = 100.0f;

  UPROPERTY(ReplicatedUsing=OnRep_Health, BlueprintReadOnly, Category="TGG|Damage")
  float Health = 100.0f;

  UPROPERTY(ReplicatedUsing=OnRep_Armor, BlueprintReadOnly, Category="TGG|Damage")
  float Armor = 0.0f;

  UPROPERTY(ReplicatedUsing=OnRep_KnockedOut, BlueprintReadOnly, Category="TGG|Damage")
  bool bKnockedOut = false;

  UPROPERTY(Replicated, EditAnywhere, BlueprintReadOnly, Category="TGG|Damage")
  bool bInvulnerable = false;

  UPROPERTY(BlueprintAssignable, Category="TGG|Damage")
  FTGGDamageApplied OnDamageApplied;
  UPROPERTY(BlueprintAssignable, Category="TGG|Damage")
  FTGGDamageValueChanged OnHealthChanged;
  UPROPERTY(BlueprintAssignable, Category="TGG|Damage")
  FTGGDamageValueChanged OnArmorChanged;
  UPROPERTY(BlueprintAssignable, Category="TGG|Damage")
  FTGGDamageStateEvent OnKnockedOut;
  UPROPERTY(BlueprintAssignable, Category="TGG|Damage")
  FTGGDamageStateEvent OnRespawnReset;

  // Native-only because FTGGDamageRequest belongs to the portable, Unreal-independent core.
  bool ApplyDamage(const FTGGDamageRequest& Request);

  UFUNCTION(BlueprintCallable, BlueprintAuthorityOnly, Category="TGG|Damage")
  bool SetInvulnerable(bool bNewInvulnerable);

  UFUNCTION(BlueprintCallable, BlueprintAuthorityOnly, Category="TGG|Damage")
  bool ResetForRespawn(float HealthPercent = 1.0f, float ArmorPercent = 0.0f);

  UFUNCTION(BlueprintPure, Category="TGG|Damage") float GetHealthPercent() const;
  UFUNCTION(BlueprintPure, Category="TGG|Damage") float GetArmorPercent() const;
  FTGGDamageHudState GetHudState() const;

  virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:
  virtual void BeginPlay() override;

  UFUNCTION() void OnRep_Health(float PreviousHealth);
  UFUNCTION() void OnRep_Armor(float PreviousArmor);
  UFUNCTION() void OnRep_KnockedOut(bool bPreviousKnockedOut);
};
