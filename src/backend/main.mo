import Text "mo:core/Text";
import Array "mo:core/Array";
import Map "mo:core/Map";
import Order "mo:core/Order";
import Runtime "mo:core/Runtime";
import Principal "mo:core/Principal";

actor {
  type ScoreEntry = {
    name : Text;
    score : Nat;
  };

  module ScoreEntry {
    public func compareByScore(a : ScoreEntry, b : ScoreEntry) : Order.Order {
      Nat.compare(b.score, a.score);
    };
  };

  let personalBest = Map.empty<Principal, Nat>();
  let highScores = Map.empty<Text, Nat>();

  public shared ({ caller }) func submitScore(name : Text, score : Nat) : async () {
    switch (highScores.get(name)) {
      case (?existingScore) {
        if (score > existingScore) {
          highScores.add(name, score);
        };
      };
      case (null) {
        highScores.add(name, score);
      };
    };

    switch (personalBest.get(caller)) {
      case (?best) {
        if (score > best) {
          personalBest.add(caller, score);
        };
      };
      case (null) {
        personalBest.add(caller, score);
      };
    };
  };

  public query ({ caller }) func getLeaderboard() : async [ScoreEntry] {
    let entries = highScores.entries().toArray().map(func((name, score)) { { name; score } });
    entries.sort(ScoreEntry.compareByScore);
  };

  public query ({ caller }) func getPersonalBest() : async Nat {
    switch (personalBest.get(caller)) {
      case (?score) { score };
      case (null) { Runtime.trap("No personal best found.") };
    };
  };
};
